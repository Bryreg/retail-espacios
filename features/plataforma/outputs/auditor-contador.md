# Conciliación de métricas — auditoría del Contador (Fase 4)

**Auditor:** Contador de Métricas · **Rama:** `claude/fase-4-plataforma` · **Sin commit ni push.**
**Territorio tocado:** `backend/tests/test_metricas_conciliacion.py` (archivo nuevo) y este reporte.
**Código de producción tocado:** ninguno. Los defectos se documentan con el número
esperado, el número devuelto y un test `xfail(strict=True)` que los demuestra.

---

## 0. Veredicto en una pantalla

| | |
|---|---|
| Agregados por cliente contra cuentas a mano | **conciliaron los 8, en los 5 clientes legibles, a la primera** |
| Consolidado = suma de sus partes | **sí** para ingreso, espacios, sedes, contratos y top de proveedores |
| Canon promedio consolidado | **ponderado** (Σ canones / Σ contratos), no promedio de promedios — verificado con dos números distintos |
| Ocupación consolidada | **Σ ocupadas / Σ comercializables**, no promedio de porcentajes — ídem |
| Cliente con base rota | fuera de todo agregado, contado aparte, sin filtrar la base al JSON |
| Cliente suspendido | **adentro** del consolidado, entero |
| Rangos inclusivos en ambos extremos | correctos |
| Forma del JSON contra la lista TAXATIVA de la spec | **exacta**: ni un campo de más ni de menos |
| Suite completa | **verde dos veces** (552 pruebas · 538 `passed` · 14 `xfailed` · `exit 0`) |
| Hallazgos | **1 bloqueante**, **1 mayor**, **4 menores**, **1 gap de proceso** |

Lo que *no* falló es tan importante como lo que falló: **las tres cifras de dinero
—ingreso por cliente, ingreso consolidado y canon promedio— cierran entre sí**, que
es exactamente lo que no pasaba en la auditoría de vitrinas. El consolidado de este
endpoint sí es la suma de sus partes.

Lo que falló es el **inventario**: el denominador de la ocupación se encoge en el
mueble más común del negocio (hallazgo `b-1`).

---

## 1. El escenario sembrado, y por qué éste

Escenario **multi-cliente propio**, distinto del de `test_plataforma_metricas.py` (el
del constructor) a propósito: si dos escenarios independientes dan los mismos
agregados, los agregados son del negocio y no del test.

Período de referencia **2026-09** → `desde = 2026-09-01`, `hasta = 2026-09-30`.

| slug | qué aporta al escenario |
|---|---|
| `centro` | 2 caras, 2 contratos — uno **arranca exactamente en `hasta`** |
| `galerias` | el cliente por defecto: sin plano, sin contratos, sin gente → denominador 0 |
| `norte` | 2 sedes con plano **+ 1 sede con el plano vacío**, góndola doble con `faceB`, columna `rentable:false`, contrato de **un solo día**, contrato que **arranca a mitad del período**, contrato que **termina exactamente en `desde`**, contrato sobre un **espacio que no está en el plano**, y tres que NO cuentan (vencido, futuro, **cancelado**) |
| `roto` | fila en el registro + archivo basura donde va la base → **base ilegible** |
| `sur` | 7 caras, 7 contratos, **6 proveedores distintos** → corte en 5 + desempate alfabético |
| `susp` | **SUSPENDIDO**, y con canon en **centavos** (prueba de conciliación con floats) |

Gente sembrada, con `ultimo_login` fijado a mano (si no, la fecha esperada dependería
del día en que corra el test):

| persona | membresías | último acceso |
|---|---|---|
| dueña de `norte` | norte (owner) | 2026-09-01 |
| dueño de `centro` | centro (owner) | 2026-09-20 |
| dueño de `sur` | sur (owner) | **nunca** |
| dueña de `susp` | susp (owner) | 2026-07-05 |
| **cuenta compartida** | norte + centro **activas**, sur **dada de baja** | 2026-09-17 |

---

## 2. Las cuentas, hechas a mano

### 2.1 `norte` — el cliente con todos los bordes

**Inventario (denominador).** Muebles de N1 y N2, uno por uno:

| mueble | regla | caras |
|---|---|---|
| `PUN-01` (N1) | punta común | `N1-PUN-01` |
| `GON-01` (N1) | góndola **doble** → cara A + cara B con sufijo `-B` | `N1-GON-01`, `N1-GON-01-B` |
| `COL-01` (N1) | `rentable: false` explícito → infraestructura | — |
| `CHK-01` (N1) | **sin** la bandera `rentable` → ausente = comercializable | `N1-CHK-01` |
| `PUN-01` (N2) | otra sede, otro código completo | `N2-PUN-01` |
| sede `N0` | plano guardado **sin muebles** → no es "sede con plano" | — |

→ **sedes_con_plano = 2**, **espacios_comercializables = 5**.

**Contratos, y por qué cada uno cuenta o no** (activo = `start ≤ 2026-09-30` **y**
`end ≥ 2026-09-01` **y** no cancelado):

| # | espacio | proveedor | desde → hasta | canon | ¿cuenta? |
|---|---|---|---|---|---|
| a | `N1-PUN-01` | Alpina | 09-15 → 09-15 | 1.000.000 | **sí** — un solo día, adentro |
| b | `N1-GON-01-B` | Alpina | 09-20 → 10-31 | 2.000.000 | **sí** — arranca a mitad |
| c | `N2-PUN-01` | Bavaria | 06-01 → **09-01** | 500.000 | **sí** — termina en `desde`, inclusivo |
| d | `FANTASMA-99` | Alpina | 09-01 → 09-30 | 700.000 | **sí** para plata, **no** para ocupación |
| e | `N1-CHK-01` | Bavaria | 08-01 → **08-31** | 800.000 | no — un día antes de `desde` |
| f | `N1-GON-01` | Postobon | **10-01** → 10-31 | 3.000.000 | no — un día después de `hasta` |
| g | `N1-GON-01` | Postobon | 09-01 → 09-30 | 9.000.000 | no — **cancelado** (`is_active=false`) |

- `ingreso_contratado_mes` = 1.000.000 + 2.000.000 + 500.000 + 700.000 = **4.200.000,00**
- contratos activos = **4** → `canon_promedio_mensual` = 4.200.000 / 4 = **1.050.000,00**
- ocupadas = `{N1-PUN-01, N1-GON-01-B, N2-PUN-01}` = **3**
  (`FANTASMA-99` no está en el plano: si contara, 4/5 = 80,0 % — un numerador que el
  denominador no contiene)
- `ocupacion_pct` = 3 / 5 × 100 = **60,0**
- `top_proveedores` = Alpina 3 (a, b, d), Bavaria 1 (c) → **[Alpina 3, Bavaria 1]**
- `usuarios_con_cuenta` = **2** (dueña + compartida) · `ultimo_acceso` = **2026-09-17**

### 2.2 `centro`

- caras `C1-E-01`, `C1-E-02` → **2**; sedes **1**
- contratos: `C1-E-01` 09-01→09-30 = 100.000 · `C1-E-02` **09-30**→11-30 = 50.000
  (arranca exactamente en `hasta`: cuenta)
- ingreso = **150.000,00** · promedio = 150.000 / 2 = **75.000,00**
- ocupadas 2 de 2 → **100,0** · top = **[Zenu 2]**
- usuarios **2** · último acceso **2026-09-20** (el dueño le gana a la compartida)

### 2.3 `sur` — el corte en 5

7 contratos sobre 7 caras, todos vigentes el mes entero:
Alpina ×2 (400.000 c/u), Bavaria, Colanta, Diana, Exito, Familia (200.000/300.000).

- ingreso = 400.000×2 + 300.000 + 200.000×4 = **1.900.000,00**
- promedio = 1.900.000 / 7 = 271.428,5714… → **271.428,57**
- ocupación 7/7 = **100,0**
- top: Alpina 2, después **empate a 1** ordenado alfabéticamente →
  Bavaria, Colanta, Diana, Exito · **Familia queda afuera** por el corte en 5
- usuarios = **1**: la cuenta compartida tiene acá la membresía **dada de baja**
- último acceso = **null**: su único usuario nunca entró

### 2.4 `susp` — suspendido, y con centavos

- caras `S1-P-01`, `S1-P-02`, `S1-G-01` → **3**
  (`G-01` es góndola **mural**: una sola cara, aunque sea góndola)
- contratos: `S1-P-01` 300.000,33 · `S1-G-01` 200.000,35
- ingreso = **500.000,68** · promedio = 500.000,68 / 2 = **250.000,34**
- ocupadas 2 de 3 → 66,666… → **66,7**
- top: empate 1-1 → alfabético → **[Alpina 1, Zenu 1]**

### 2.5 `galerias` — el denominador cero

sedes 0 · caras 0 · `ocupacion_pct` **null** (no es 0 %: *no tiene* ocupación) ·
`canon_promedio_mensual` **null** · `ingreso_contratado_mes` **0.0** (facturó cero, y
cero es un número) · top `[]` · usuarios 0 · último acceso null.

### 2.6 Consolidado

```
Σ sedes         = 2 + 1 + 1 + 1 + 0 = 5
Σ caras         = 5 + 2 + 7 + 3 + 0 = 17
Σ ocupadas      = 3 + 2 + 7 + 2 + 0 = 14
Σ contratos     = 4 + 2 + 7 + 2 + 0 = 15
Σ canones       = 4.200.000,00 + 150.000,00 + 1.900.000,00 + 500.000,68
                = 6.750.000,68
```

| agregado | cuenta | valor |
|---|---|---|
| `clientes_total` | 6 filas (roto incluido) | **6** |
| `clientes_con_error` | roto | **1** |
| `sedes_con_plano` | Σ | **5** |
| `espacios_comercializables` | Σ | **17** |
| `ocupacion_pct` | 14 / 17 × 100 = 82,3529… | **82,4** |
| `canon_promedio_mensual` | 6.750.000,68 / 15 = 450.000,0453… | **450.000,05** |
| `ingreso_contratado_mes` | Σ | **6.750.000,68** |
| `usuarios_con_cuenta` | personas **distintas** | **5** |

`top_proveedores` consolidado, sumando los conteos **completos** de cada cliente
(no los top-5 truncados):

```
Alpina  = 3 (norte) + 2 (sur) + 1 (susp) = 6
Zenu    = 2 (centro) + 1 (susp)          = 3
Bavaria = 1 (norte) + 1 (sur)            = 2
Colanta = 1 (sur)   Diana = 1 (sur)   Exito = 1 (sur)   Familia = 1 (sur)
```
→ orden `(-conteo, nombre)` → **[Alpina 6, Zenu 3, Bavaria 2, Colanta 1, Diana 1]**;
Exito y Familia caen por el corte en 5 con desempate alfabético.

### 2.7 Las dos cuentas EQUIVOCADAS, con nombre y número

El escenario está armado para que la cuenta correcta y la incorrecta den distinto.
Si alguien cambiara una por la otra, el test lo dice con los dos números en la mano:

| agregado | cuenta CORRECTA | cuenta EQUIVOCADA |
|---|---|---|
| ocupación consolidada | Σ ocupadas / Σ caras = **82,4** | promedio de los % de las filas = (60,0+100,0+100,0+66,7)/4 = **81,7** |
| canon promedio consolidado | Σ canones / Σ contratos = **450.000,05** | promedio de los promedios = (1.050.000 + 75.000 + 271.428,57 + 250.000,34)/4 = **411.607,23** |

El código hace las dos correctas. `_consolidar` no promedia promedios.

### 2.8 El mismo cliente, tres meses

| período | contratos de `norte` | ingreso | promedio | ocupación |
|---|---|---|---|---|
| **2026-08** | (c) y (e), los dos de Bavaria | 1.300.000,00 | 650.000,00 | 2/5 = **40,0** |
| **2026-09** | (a) (b) (c) (d) | 4.200.000,00 | 1.050.000,00 | 3/5 = **60,0** |
| **2026-11** | ninguno | 0,00 | **null** | 0/5 = **0,0** |

El inventario (5 caras) no cambia con el mes; lo que cambia es lo contratado. Y
`0,0` (hay caras, ninguna ocupada) no es lo mismo que `null` (no hay caras).

---

## 3. Qué concilia — la sección que existe por la lección de vitrinas

Los tests de esta sección comparan la respuesta **contra sí misma**, sin usar ninguna
constante del escenario: aunque los datos sembrados cambiaran, esto tiene que seguir
cuadrando.

| conciliación | resultado |
|---|---|
| `consolidado.ingreso_contratado_mes` == Σ `ingreso` de las filas legibles | ✅ 6.750.000,68 == 6.750.000,68 |
| `consolidado.espacios_comercializables` == Σ filas | ✅ 17 |
| `consolidado.sedes_con_plano` == Σ filas | ✅ 5 |
| conteo consolidado de cada proveedor == Σ de sus conteos por cliente | ✅ los 5 del top |
| Σ contratos deducido (ingreso / canon ponderado) == contratos sembrados | ✅ 15 |
| `clientes_total − clientes_con_error` == filas con `metricas` | ✅ 5 |
| cada fila: `error` **xor** `metricas` (nunca los dos, nunca ninguno) | ✅ |
| suma de floats con centavos: Σ(redondeados) == redondeo(Σ) | ✅ |

**La única cifra que a propósito NO concilia** es `usuarios_con_cuenta`: Σ de las
filas da **6** y el consolidado dice **5**, porque la cuenta compartida es *una*
persona con cuenta en dos supermercados. Es correcto y está documentado en el código
(`_consolidar`), pero **el JSON no da forma de saberlo** — ver hallazgo `m-3`.

---

## 4. Hallazgos

Severidades: **bloqueante** = número del panel equivocado en operación normal ·
**mayor** = el operador puede tomar una decisión mala o ver su propia acción sin
efecto · **menor** = correcto hoy, frágil o mal declarado.

---

### `b-1` — BLOQUEANTE · Una góndola doble sin `faceB` cuenta UNA sola cara

**Dónde:** `backend/app/plataforma_metricas.py::_caras_comercializables`

```python
if _es_gondola_doble(fixture) and isinstance(fixture.get("faceB"), dict):
    caras.add(f"{completo}-B")
```

**El defecto.** La cara B sólo se suma si el fixture trae la clave `faceB` como
objeto. Pero `faceB` es **opcional** y sólo aparece cuando esa cara tuvo datos
comerciales alguna vez: `UnifiedFixture.faceB?: FaceData`
(`frontend/src/types/fixtures.ts`), y el editor 3D la guarda como
`faceB: existing?.faceB` (`StoreEditor3D.tsx:4341`) — o sea, **ausente** en toda
góndola doble recién dibujada.

La app del cliente cuenta lo contrario y es la referencia:
`facesOf()` en `pages/DashboardView.tsx:148` hace `const b = f.faceB ?? EMPTY_FACE`
y devuelve **dos** caras siempre; el mapa isométrico pinta las dos mitades; y
`docs/ESTADO.md` lo dice como regla dura: *"Una góndola doble son dos espacios"*.

**Esperado vs devuelto** (góndola doble sin `faceB`, un contrato sobre la cara B):

| | esperado | devuelto |
|---|---|---|
| `espacios_comercializables` | **2** | **1** |
| `ocupacion_pct` | **50,0** | **0,0** |

**Por qué es bloqueante y no menor.** No es un caso raro: es el estado normal de toda
góndola doble a la que todavía no se le vendió la cara B, y la góndola es el mueble
más común del plano. El error entra en el **denominador** del único porcentaje del
panel, y por lo tanto en el `ocupacion_pct` consolidado. Peor: la cara B ocupada
tampoco entra en el numerador, así que el panel puede mostrar 0 % de ocupación sobre
un mueble que está vendido. `docs/ESTADO.md` además registra que el editor 3D
**borraba `faceB`** de todos los fixtures con sólo abrirse (bug ya corregido, datos
ya persistidos): hay planos vivos en ese estado.

**No es un descuido, es una decisión mal tomada.** `features/plataforma/outputs/backend-metricas.md`
la declara explícitamente: *"Góndola doble (…) **con `faceB` presente** = dos caras"*.
O sea que la condición se eligió a propósito, con el criterio equivocado: `faceB` no
es lo que hace que una góndola sea doble —lo es `gondolaType`—; `faceB` es sólo el
lugar donde se guardan los datos comerciales de la cara B cuando los hay. Un mueble
vacío sigue siendo inventario: es justamente el que hay para vender.

**Arreglo sugerido (no aplicado):** sumar la cara B por `_es_gondola_doble(fixture)`
a secas, sin mirar `faceB` — que es lo que hace `facesOf`. Y actualizar esa línea de
`backend-metricas.md` en el mismo cambio.

**Tests que lo fijan:**
`test_hallazgo_b1_gondola_doble_sin_faceB_deberia_contar_dos_caras` (unitario) y
`test_hallazgo_b1_un_contrato_sobre_la_cara_B_invisible_no_ocupa` (por el endpoint).
Los dos `xfail(strict=True)`: el día que se corrija pasan a XPASS y **rompen la
suite**, obligando a sacarles la marca.

---

### `M-1` — MAYOR · El `estado_cuenta` del JSON de métricas queda viejo hasta 5 minutos

**Dónde:** `backend/app/plataforma_metricas.py` (caché) +
`backend/app/routers/plataforma.py::cambiar_estado_cliente`

**El defecto.** El `PATCH /api/plataforma/clientes/{slug}` invalida
`plataforma_estado._estado_cache` (`invalidar_cache_estado(slug)`) pero **no toca el
caché de métricas**, que guarda el cuerpo entero —`estado_cuenta` incluido— por 5
minutos. En la misma consola, el operador cambia el estado de un cliente y el JSON de
métricas sigue diciendo el estado anterior.

La spec lista entre los agregados taxativos **"estado de cuenta actual"**. Después
del PATCH no es el actual.

| | esperado | devuelto |
|---|---|---|
| `clientes[centro].estado_cuenta` tras suspender `centro` | `"suspendido"` | `"activo"` |
| `GET /api/plataforma/clientes` (mismo instante) | `"suspendido"` | `"suspendido"` ✅ |

**Dos endpoints de la misma pantalla contestan cosas distintas sobre el mismo hecho.**
Hoy la UI se salva de casualidad: `pages/Plataforma.tsx` pinta el estado desde
`GET /plataforma/clientes` y usa `/metricas` sólo para los números. Es una salvedad
de implementación, no una garantía: el campo existe en el JSON de métricas
justamente para que se pueda leer de ahí.

**Síntoma colateral, ya visible en el repo:** el test del constructor
`test_cliente_suspendido_aparece_con_sus_metricas` tiene que llamar a
`limpiar_cache_metricas()` a mano después del PATCH. Cuando un test necesita vaciar
un caché para ver el efecto de la acción que acaba de hacer, el usuario también lo
va a necesitar y no tiene cómo.

**Arreglo sugerido (no aplicado):** o el PATCH invalida también el caché de métricas
(una función `invalidar_cache_metricas()` al lado de la que ya existe), o
`estado_cuenta` se resuelve **fuera** del caché, en `metricas_del_periodo`, antes de
devolver — los estados están en el registro y se leen en una consulta.

**Test:** `test_hallazgo_M1_el_estado_del_json_de_metricas_queda_viejo_tras_el_patch`,
`xfail(strict=True)`.

---

### `m-1` — MENOR · El tipo legado `gondola_doble` no se reconoce como doble

**Dónde:** `plataforma_metricas.py::_es_gondola_doble` — exige `type == "gondola"`.

`pages/DashboardView.tsx:131` conserva **a propósito** el guard
`isDoubleGondolaShared(f) || f.type === "gondola_doble"`, con el comentario
*"kept for old persisted layouts"*. Un layout viejo con ese tipo cuenta 2 caras en la
app del cliente y **1** en el panel del operador.

| | esperado | devuelto |
|---|---|---|
| caras de `{code:"GON-88", type:"gondola_doble"}` | `{X-GON-88, X-GON-88-B}` | `{X-GON-88}` |

Menor y no bloqueante porque el pipeline actual normaliza ese tipo al importar
(`fixtureStore.ts:1284`, `FloorPlan2D.tsx:321`): sólo afecta a snapshots viejos que
no hayan pasado por un guardado desde entonces. Pero es exactamente la misma clase de
error que `b-1` y se arregla en la misma línea.

**Test:** `test_hallazgo_m1_tipo_legado_gondola_doble_deberia_contar_dos_caras`,
`xfail(strict=True)`.

---

### `m-2` — MENOR · El porcentaje redondea "la mitad al par", no "la mitad hacia arriba"

`_pct` usa `round(x, 1)`, que en Python redondea la mitad exacta al **par** más
cercano. 13/16 = 81,25 % sale como **81,2** y no como 81,3; 3/16 = 18,75 % sale como
**18,8**. No es un error —es el comportamiento de `round`— pero es una decisión que
nadie tomó explícitamente y que en el consolidado separa el número del panel del que
el operador saca con la calculadora.

**No se marcó como xfail**: se **pineó** con un test verde
(`test_el_porcentaje_redondea_a_la_mitad_par`) para que un cambio de criterio no pase
inadvertido. Si el negocio prefiere media-hacia-arriba, hay que usar `Decimal` con
`ROUND_HALF_UP` y actualizar ese test en el mismo PR.

Nota relacionada, **sin hallazgo**: `_plata` redondea cada fila a 2 decimales y el
consolidado redondea la suma **cruda**, no la suma de las redondeadas. Con canones de
hasta dos decimales (que es lo que existe: son pesos) las dos cuentas dan idéntico, y
así se verificó con centavos de verdad (`susp`). Con canones de tres o más decimales
podrían separarse por un centavo; no es un caso que el sistema pueda producir hoy.

---

### `m-3` — MENOR · El panel muestra dos cifras de usuarios que no suman, y no lo dice

`consolidado.usuarios_con_cuenta` cuenta **personas distintas** (bien: la misma
persona en dos supermercados no son dos usuarios de la plataforma). Las filas cuentan
por cliente. En el escenario: Σ filas = **6**, consolidado = **5**.

Es la única cifra del JSON que no concilia, y es correcta. El problema es que el
operador que sume la columna va a encontrar la diferencia y no va a tener dónde leer
por qué: el JSON no trae nada que lo explique y la pantalla tampoco. Sugerencia
(fuera de mi territorio): una nota al pie en la tarjeta del consolidado —"usuarios
distintos; una persona puede tener cuenta en varios supermercados"—.

Verificado y fijado en `test_usuarios_consolidados_son_personas_distintas_no_la_suma_de_filas`.

---

### `m-4` — MENOR / OBSERVACIÓN · El top-5 por cliente hace inauditables a los proveedores cortados

Con más de 5 proveedores en un cliente (`sur` tiene 6), su top-5 truncado **no
permite** reconstruir el consolidado desde el JSON: Familia existe, tiene un contrato
y no aparece en ninguno de los dos tops. El cálculo interno **sí** usa los conteos
completos (`_consolidar` suma `crudos["proveedores"]`, no el top truncado), así que
el número consolidado es correcto — lo verificado y fijado en
`test_conciliacion_del_top_de_proveedores`.

Es consecuencia sabida de que la spec pida "top 5", no un defecto. Se deja anotado
porque es la única parte del JSON donde la conciliación fila-a-consolidado **no puede**
hacerse desde afuera, y quien audite esto en el futuro va a tropezar con lo mismo.

---

### `g-1` — GAP DE PROCESO · El `rm` del gotcha R-0 no limpia el directorio temporal

El `rm` que documenta `docs/ESTADO.md` para R-0 borra `backend/retail_espacios.db` y
`backend/recabra_*.db`, pero las bases de los clientes de prueba **no viven ahí**:
el fixture `client()` de `tests/conftest.py` usa `tempfile.mkstemp()` y crea las
hermanas `recabra_*.db` al lado, en `/tmp`. Una corrida interrumpida deja ahí `.db` y
`.db-journal` que hacen fallar a la siguiente con
`sqlite3.OperationalError: attempt to write a readonly database` —un error que no
menciona ningún archivo y manda a buscar el problema al lado equivocado—. Pasó tres
veces en esta auditoría, una de ellas en un test pre-existente y ajeno a la Fase 4
(`test_plataforma.py::test_soy_true_para_operador`). Sugerencia: ampliar el `rm`
documentado a `/tmp/recabra_*.db` y `/tmp/*.db-journal`, o hacer que `conftest.py`
use un directorio temporal propio por sesión (`tmp_path_factory`) en vez de sembrar
`/tmp` con hermanas sueltas.

---

## 5. Lo que se verificó y quedó bien (para que no se re-audite)

- **Forma del JSON, exacta contra la lista taxativa de la spec.** Claves de raíz,
  del consolidado, de cada fila y de cada bloque `metricas`; `ultimo_acceso` está en
  la fila y **no** en el consolidado; cada entrada del top trae exactamente
  `{nombre, contratos_activos}`; ningún top pasa de 5.
- **La frontera de la enmienda del operador.** Recorrido de todo el JSON real: ni una
  clave prohibida (`leases`, `monthly_rent`, `start_date`, `email`, `motivo`,
  `cambiado_por`, …), y los **únicos arreglos** de toda la respuesta son `clientes` y
  `top_proveedores`. Ninguno de los cinco correos sembrados aparece en el texto plano
  de la respuesta.
- **Sólo lectura, de verdad.** Foto de `spaces`, `space_leases`, `suppliers`,
  `layout_snapshots` y `audit_log` de los cuatro clientes legibles antes y después de
  tres consultas: idénticas.
- **Base rota.** Fila con `metricas: null` y texto de error **fijo**; el texto no
  contiene `sqlite`, `recabra_roto`, `.db`, `/`, `database` ni el mensaje del driver.
  El resto del panel no se entera y el consolidado no la suma.
- **Caché de 5 minutos.** El acierto devuelve exactamente los mismos números y el
  mismo `generado_en` que el cálculo, marcado con `de_cache: true`.
- **Bitácora del registro.** Una línea por consulta —incluida la servida del caché—
  con el correo del operador, la acción y el período. Se registra el **acceso**, no
  el cálculo, que es lo correcto.
- **Rangos inclusivos.** `rango_del_periodo` devuelve el mes entero, febrero de un
  bisiesto incluido; los contratos que tocan `desde` o `hasta` por un solo día
  cuentan, y los que quedan a un día de distancia no.

---

## 6. Sobre `VERSION_POLITICA` (nota del auditor, territorio ajeno)

`features/plataforma/outputs/legal-politica.md` decide **no** subir
`VERSION_POLITICA` y tratar el punto nuevo como aclaración editorial. Desde lo que
mide este endpoint, la decisión se sostiene: el JSON auditado **no contiene un solo
dato personal de un usuario final** —ni correos, ni nombres, ni filas—; lo único
cercano es `ultimo_acceso`, que es una **fecha sin hora y sin quién**, y
`usuarios_con_cuenta`, que es un conteo. No hay tratamiento nuevo de datos personales
del titular que justifique re-consentir a todo el padrón.

El único dato de terceros que sale nominado es el **nombre de proveedor** en el
top-5, que es dato de persona jurídica en la enorme mayoría de los casos — pero no
siempre (un proveedor puede ser una persona natural con nombre propio). Eso queda
como pregunta para el `[VALIDAR CON ABOGADO]` que la fase ya abrió, no como objeción
a la versión.

---

## 7. Cómo reproducir

```bash
rm -f backend/retail_espacios.db backend/recabra_*.db
cd backend && python -m pytest tests/test_metricas_conciliacion.py -q
# 33 passed, 4 xfailed   <- los 4 xfailed son los hallazgos b-1 (x2), m-1 y M-1
```

Suite completa, dos veces, borrando las `.db` entre corridas (gotcha **R-0** de
`docs/ESTADO.md`: la suite sólo está verde la primera vez sobre un checkout sucio,
porque `tests/test_correo_api.py` importa `app.services.mailer` a nivel de módulo y
deja `app.database` clavado contra `sqlite:///./retail_espacios.db`):

```bash
rm -f backend/retail_espacios.db backend/recabra_*.db && (cd backend && python -m pytest -q)
rm -f backend/retail_espacios.db backend/recabra_*.db && (cd backend && python -m pytest -q)
```

**Resultado: verde las dos veces** — `538 passed, 14 xfailed` sobre 552 pruebas,
`exit 0` en ambas. De los 14 `xfailed`, **10 ya existían** en el repo y **4 son los
hallazgos de este archivo** (`b-1` ×2, `m-1`, `M-1`).

### Una advertencia de entorno, para el próximo que la pise

Tres veces durante esta auditoría una corrida murió con

```
sqlite3.OperationalError: attempt to write a readonly database
```

al crear tablas o sembrar la base de un cliente (una vez en este archivo, una vez en
`tests/test_plataforma.py::test_soy_true_para_operador`, que es pre-existente y no
toca nada de la Fase 4). **No es del código auditado ni de ningún test**: es basura
en el directorio temporal —`.db` y `.db-journal` sueltos de corridas anteriores que
murieron a mitad—. Con el `rm` de R-0 ampliado al temporal, las dos corridas
completas salieron verdes:

```bash
rm -f /tmp/recabra_*.db /tmp/*.db-journal
rm -f backend/retail_espacios.db backend/recabra_*.db
```

Conviene sumarlo al gotcha R-0 en `docs/ESTADO.md`: hoy el `rm` documentado limpia
`backend/` pero no el temporal, que es donde el fixture `client()` de `conftest.py`
crea las bases de los clientes (`tempfile.mkstemp` + hermanas `recabra_*.db`), y una
corrida interrumpida deja ahí exactamente lo que hace fallar a la siguiente.
