# Conciliación de métricas — auditoría del Contador (Fase 4)

**Auditor:** Contador de Métricas · **Rama:** `claude/fase-4-plataforma` · **Sin commit ni push.**
**Territorio tocado:** `backend/tests/test_metricas_conciliacion.py` (archivo nuevo) y este reporte.
**Código de producción tocado:** ninguno. Los defectos se documentan con el número
esperado, el número devuelto y un test `xfail(strict=True)` que los demuestra.

**Segunda pasada (iteración 2).** El backend corrigió los dos hallazgos de caras
(`b-1` bloqueante y `m-1` menor) y agregó la **supresión de celda chica K=3**
(hallazgo H-2 del red team). Los tres tests que estaban en rojo a propósito pasaron
a verde y se les sacó la marca; las cuentas a mano de todo el escenario se
**rehicieron con lápiz antes** de mirar la salida del endpoint, y el resultado está
en la sección 2 bis. Lo que cambió y lo que no está marcado en cada lugar.

**Y una mala noticia de proceso:** la suite completa **no está verde** — sale con
**exit 1**, por tres tests del archivo del red team que quedaron desactualizados
frente a esos mismos arreglos. No es mi territorio y no los toqué. Ver `b-2` (§4).

---

## 0. Veredicto en una pantalla

| | |
|---|---|
| Agregados por cliente contra cuentas a mano | **conciliaron los 8, en los 5 clientes legibles**, en las dos pasadas |
| Consolidado = suma de sus partes | **sí**, con las no-conciliaciones declaradas de K=3 (§3) |
| Canon promedio consolidado | **ponderado** (Σ canones / Σ contratos), no promedio de promedios — con dos números distintos, en dos escenarios distintos |
| Ocupación consolidada | **Σ ocupadas / Σ comercializables**, no promedio de porcentajes — ídem |
| Cliente con base rota | fuera de todo agregado, contado aparte, sin filtrar la base al JSON |
| Cliente suspendido | **adentro** del consolidado, entero — con su plata suprimida en la fila y **presente en el total** |
| Rangos inclusivos en ambos extremos | correctos |
| Forma del JSON contra la lista TAXATIVA de la spec | **exacta**: ni un campo de más ni de menos |
| Frontera de K=3 (2 contratos vs 3) | probada en los dos niveles, fila y consolidado |
| `tests/test_metricas_conciliacion.py` | **39 casos · 38 `passed` · 1 `xfailed`** (el `xfailed` es `M-1`, el hallazgo que sigue abierto) |
| **Suite completa** | **ROJA: exit 1**, 3 fallas — las **tres** en `tests/test_metricas_ataques.py` (red team), ninguna en código ni en mi archivo. Ver `b-2` |
| Hallazgos | `b-1` y `m-1` **corregidos y fijados en verde** · **1 bloqueante de proceso nuevo** (`b-2`) · 1 mayor abierto (`M-1`) · 5 menores · 1 gap |

Lo que *no* falló es tan importante como lo que falló: **las tres cifras de dinero
—ingreso por cliente, ingreso consolidado y canon promedio— cierran entre sí**, que
es exactamente lo que no pasaba en la auditoría de vitrinas. El consolidado de este
endpoint sí es la suma de sus partes; con K=3, es la suma de las partes **visibles
más las suprimidas**, y esa diferencia vale, al centavo, lo que las filas suprimidas
se guardan (§3).

Lo que falló en la primera pasada fue el **inventario**: el denominador de la
ocupación se encogía en el mueble más común del negocio. **Está corregido.**

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

### El único cambio del escenario en la segunda pasada, y por qué

Se agregó **un contrato a `norte`**, el `(h)`:

```
(h)  FANTASMA-98 · Colanta · 2026-08-01 → 2026-08-31 · 200.000,00 · activo
```

**Motivo, y es de la regla nueva.** Con K=3, agosto tenía 2 contratos —(c) y (e)— y
salía **suprimido entero**: la verificación obligatoria «mes con contrato vigente vs
mes anterior dan números distintos y correctos» no habría podido comparar un solo
peso, sólo porcentajes. Con (h), agosto tiene 3 y se publica.

Se eligió un espacio **fantasma** (sin mueble en el plano) a propósito: si (h)
ocupara una cara real, agosto pasaría a 3/5 = 60,0 % y daría **lo mismo** que
septiembre — justo lo que el test tiene que distinguir. Septiembre no se entera de
(h) (termina el 31 de agosto), así que **ni un número de la primera pasada cambió
por esto**.

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

> **Nota de la segunda pasada.** El arreglo de `b-1` (cara B por TIPO, sin exigir
> `faceB`) **no movió este número**: la góndola de `norte` ya traía `faceB` en el
> fixture, así que ya contaba dos caras. Se verificó a mano **antes** de correr nada:
> el denominador consolidado **no creció**, sigue en 17, y el consolidado testigo
> (450.000,05 · 82,4) sigue igual. El arreglo cambia el resultado de los muebles
> **sin** `faceB`, que este escenario prueba aparte (§5, tests de defensa).

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
| h | `FANTASMA-98` | Colanta | 08-01 → 08-31 | 200.000 | no en septiembre — **sí en agosto** |

- `ingreso_contratado_mes` = 1.000.000 + 2.000.000 + 500.000 + 700.000 = **4.200.000,00**
- contratos activos = **4** → **4 ≥ K**: la fila **se publica entera**
- `canon_promedio_mensual` = 4.200.000 / 4 = **1.050.000,00**
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
- por debajo: ingreso **150.000,00** · promedio 150.000 / 2 = **75.000,00** · top **[Zenu 2]**
- **2 < K → los tres campos de plata se SUPRIMEN**: `ingreso_contratado_mes` **null**,
  `canon_promedio_mensual` **null**, `top_proveedores` **[]**
- ocupadas 2 de 2 → **100,0** (la ocupación **no** se suprime)
- usuarios **2** · último acceso **2026-09-20** (el dueño le gana a la compartida)

### 2.3 `sur` — el corte en 5

7 contratos sobre 7 caras, todos vigentes el mes entero:
Alpina ×2 (400.000 c/u), Bavaria, Colanta, Diana, Exito, Familia (200.000/300.000).

- **7 ≥ K**: se publica entero
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
- por debajo: ingreso **500.000,68** · promedio **250.000,34** · top **[Alpina 1, Zenu 1]**
- **2 < K → plata SUPRIMIDA**: null, null, []
- ocupadas 2 de 3 → 66,666… → **66,7** (se publica)

### 2.5 `galerias` — el denominador cero

sedes 0 · caras 0 · `ocupacion_pct` **null** (no es 0 %: *no tiene* ocupación) ·
`canon_promedio_mensual` **null** · top `[]` · usuarios 0 · último acceso null.

`ingreso_contratado_mes`: **era `0.0`** en la primera pasada («facturó cero, y cero
es un número») y ahora es **`null`**, porque 0 < K y la regla se aplica también al
cero. Ver el hallazgo **`m-5`** (§4).

### 2.6 Consolidado

Se calcula con los datos **subyacentes** de todos los legibles —los suprimidos
incluidos— y aplica K a su propio nivel; 15 contratos son ≥ 3, así que se publica.

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
(no los top-5 truncados, y **tampoco** los suprimidos: la supresión es de lo que se
publica, no de lo que se suma):

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

**Detalle de la segunda pasada, que importa.** El promedio-de-promedios se arma con
los cuatro promedios **reales** —los de `centro` y `susp` incluidos, aunque no se
publiquen—, tomados de las constantes a mano y **no del JSON**: la cuenta equivocada
que hay que descartar es la que haría alguien con los números del negocio en la mano.
Con K=3 en vigor, un test que leyera los promedios del JSON estaría promediando
**dos** filas y la trampa quedaría desarmada sin que nadie se enterara. Es
exactamente la clase de erosión silenciosa que este archivo existe para evitar.

El mismo par se verifica en un segundo escenario, el de la frontera de K: ahí el
ponderado da **260.000,00** y el promedio de promedios **250.000,00**.

### 2.8 El mismo cliente, tres meses

| período | contratos de `norte` | ingreso | promedio | ocupación | ¿publica? |
|---|---|---|---|---|---|
| **2026-08** | (c), (e) y (h) | 1.500.000,00 | 500.000,00 | 2/5 = **40,0** | sí (3 ≥ K) |
| **2026-09** | (a) (b) (c) (d) | 4.200.000,00 | 1.050.000,00 | 3/5 = **60,0** | sí (4 ≥ K) |
| **2026-11** | ninguno | null | null | 0/5 = **0,0** | no (0 < K) |

El inventario (5 caras) no cambia con el mes; lo que cambia es lo contratado. Y
`0,0` (hay caras, ninguna ocupada) no es lo mismo que `null` (no hay caras). Ni un
proveedor en común entre agosto (Bavaria, Colanta) y septiembre (Alpina, Bavaria):
son dos meses distintos de verdad, no el mismo número dos veces.

---

## 2 bis. La regla K=3, recalculada a mano fila por fila

La supresión de celda chica es la **única** novedad de la segunda pasada que cambia
números publicados. La regla, tal como quedó implementada
(`plataforma_metricas.py::_suprimir_celda_chica`): con **menos de 3 contratos
activos en el período**, `ingreso_contratado_mes` y `canon_promedio_mensual` van
`null` y `top_proveedores` va `[]`. Los conteos y la ocupación **no** se suprimen.

| fila | contratos activos 2026-09 | ¿≥ 3? | qué publica | qué esconde |
|---|---|---|---|---|
| `norte` | **4** | sí | 4.200.000,00 · 1.050.000,00 · [Alpina 3, Bavaria 1] | — |
| `sur` | **7** | sí | 1.900.000,00 · 271.428,57 · top de 5 | Familia 1 (por el corte en 5, no por K) |
| `centro` | **2** | **no** | null · null · [] | 150.000,00 · 75.000,00 · Zenu 2 |
| `susp` | **2** | **no** | null · null · [] | 500.000,68 · 250.000,34 · Alpina 1, Zenu 1 |
| `galerias` | **0** | **no** | null · null · [] | 0,00 · — · — |
| `roto` | — | — | fila con `error`, sin métricas | — |
| **consolidado** | **15** | sí | 6.750.000,68 · 450.000,05 · top de 5 | — |

**Lo oculto, sumado:** 150.000,00 + 500.000,68 + 0,00 = **650.000,68** en **4**
contratos, más 3 contratos de Zenu y 1 de Alpina que no aparecen en ninguna fila
visible del panel.

**Qué NO cambió con K=3** (verificado uno por uno, no asumido): los conteos de sedes
y espacios, todos los porcentajes de ocupación, `usuarios_con_cuenta`,
`ultimo_acceso`, `estado_cuenta`, la **forma** del JSON (las 8 claves taxativas
siguen presentes en toda fila legible; sólo cambia el valor) y el **consolidado
entero**.

**La frontera está probada en su borde**, que es donde una regla así se rompe:
`test_la_frontera_de_K_son_tres_contratos` siembra dos clientes gemelos —

| cliente | contratos | por debajo | qué sale |
|---|---|---|---|
| `dos` | **2** (100.000 + 300.000) | 400.000,00 · 200.000,00 | **suprimido**: null · null · [] · pero 2 caras y 100,0 % |
| `tres` | **3** (100.000 + 200.000 + 600.000) | 900.000,00 · 300.000,00 | **publicado**: 900.000,00 · 300.000,00 · [Alpina 2, Bavaria 1] |

El segundo es el primero **más un contrato**: lo único que cambia es cruzar la
frontera. El consolidado de ese escenario suma los 5 contratos —los 400.000
suprimidos incluidos— y da **1.300.000,00** con canon ponderado **260.000,00**
(el promedio de los dos promedios daría 250.000,00: la trampa, otra vez).

Y en su propio nivel:
`test_con_menos_de_K_contratos_en_toda_la_plataforma_el_consolidado_tambien_se_suprime`
—un solo cliente con 2 contratos en toda la plataforma— confirma que el
**consolidado también se suprime** (null, null, []) y que sus conteos siguen ahí
(2 caras, 100,0 %, 2 clientes).

---

## 3. Qué concilia — la sección que existe por la lección de vitrinas

Con K=3 la conciliación tiene **dos niveles**, y hay que decir cuál se está haciendo
o el test miente:

**a) Cuenta cerrada** — todo lo que no se suprime. El consolidado es, exactamente, la
suma de las filas visibles. Si esto no cuadra, es un defecto.

| conciliación | resultado |
|---|---|
| `consolidado.espacios_comercializables` == Σ filas | ✅ 17 |
| `consolidado.sedes_con_plano` == Σ filas | ✅ 5 |
| `clientes_total − clientes_con_error` == filas con `metricas` | ✅ 5 |
| cada fila: `error` **xor** `metricas` (nunca los dos, nunca ninguno) | ✅ |
| Σ contratos deducido (ingreso / canon ponderado) == contratos sembrados | ✅ 15 |
| las filas suprimidas aportan sus conteos como cualquier otra | ✅ 2, 3 y 0 caras |

**b) Cuenta con lo oculto** — plata y proveedores. El consolidado es la suma de lo
visible **más** lo que las filas suprimidas se guardan. La diferencia no es un
descuadre: es la supresión, y tiene que valer **exactamente** los números ocultos
calculados a mano. Un residuo distinto sí sería un defecto, y es lo que estos tests
atrapan.

| conciliación | visible | oculto | consolidado |
|---|---|---|---|
| `ingreso_contratado_mes` | 6.100.000,00 (norte + sur) | **650.000,68** | ✅ 6.750.000,68 |
| top · Alpina | 5 (norte 3 + sur 2) | 1 (susp) | ✅ 6 |
| top · Zenu | **0** — no está en ninguna fila | 3 (centro 2 + susp 1) | ✅ 3 |
| top · Bavaria | 2 (norte 1 + sur 1) | 0 | ✅ 2 |
| top · Colanta / Diana | 1 y 1 (sur) | 0 | ✅ 1 y 1 |
| suma de floats con centavos: Σ(redondeados) == redondeo(Σ) | | | ✅ |

### Las tres NO-CONCILIACIONES esperadas, declaradas

Un panel que no dice cuáles de sus cifras no suman es un panel que va a hacer perder
una tarde. Éstas son las tres, con su número:

1. **`ingreso_contratado_mes`** — Σ de la columna visible da **6.100.000,00** y el
   consolidado dice **6.750.000,68**. Los 650.000,68 de diferencia son, al centavo,
   lo que `centro` (150.000,00), `susp` (500.000,68) y `galerias` (0,00) tienen y no
   publican. **Es correcto y es deliberado**: suprimir una fila no puede cambiar el
   total del negocio — si lo cambiara, el operador estaría mirando un negocio más
   chico del que tiene. Fijado en `test_conciliacion_ingreso_contratado`, que
   compara el residuo contra el número a mano, no contra lo que devuelva el código.
2. **`top_proveedores`** — el caso extremo es **Zenu**: el consolidado lo nombra con
   3 contratos y **no aparece en ninguna fila del panel**, porque sus dos clientes
   están suprimidos. Fijado en `test_conciliacion_del_top_de_proveedores`. (A esto se
   le suma la vieja `m-4`: Familia se pierde por el corte en 5, no por K.)
3. **`usuarios_con_cuenta`** — Σ de las filas da **6** y el consolidado dice **5**,
   porque la cuenta compartida es *una* persona con cuenta en dos supermercados. Es
   correcto, está documentado en el código (`_consolidar`), y **el JSON no da forma
   de saberlo** — es el hallazgo `m-3`, que sigue abierto.

Las tres son propiedades del diseño, no defectos. Lo que sería un defecto es que el
residuo valiera **otra cosa**.

**Consecuencia para el frontend (fuera de mi territorio, pero nace de acá):** la
tabla del panel va a tener celdas vacías donde hay plata, y una fila de totales que
no suma la columna. Si la pantalla no lo dice —un guioncito con tooltip
«suprimido: menos de 3 contratos», y una nota al pie en el consolidado— el operador
va a concluir que el panel está roto, que es peor que no tener el panel.

---

## 4. Hallazgos

Severidades: **bloqueante** = número del panel equivocado en operación normal, o la
rama no se puede integrar · **mayor** = el operador puede tomar una decisión mala o
ver su propia acción sin efecto · **menor** = correcto hoy, frágil o mal declarado.

| # | severidad | estado |
|---|---|---|
| `b-1` | bloqueante | **CORREGIDO y fijado en verde** |
| `b-2` | **bloqueante (proceso)** | **NUEVO — abierto**: la suite sale con exit 1 |
| `M-1` | mayor | abierto (`xfail(strict=True)`) |
| `m-1` | menor | **CORREGIDO y fijado en verde** |
| `m-2` | menor | abierto, pineado en verde (decisión de negocio) |
| `m-3` | menor | abierto (sugerencia de UI), **agravado** por K=3 |
| `m-4` | menor / observación | conocido, sin acción |
| `m-5` | menor | **NUEVO** en la segunda pasada |
| `g-1` | gap de proceso | abierto (`docs/ESTADO.md`) |

---

### `b-1` — BLOQUEANTE · Una góndola doble sin `faceB` contaba UNA sola cara — **CORREGIDO**

**Dónde:** `backend/app/plataforma_metricas.py::_caras_comercializables`

**Lo que había** (primera pasada):

```python
if _es_gondola_doble(fixture) and isinstance(fixture.get("faceB"), dict):
    caras.add(f"{completo}-B")
```

La cara B sólo se sumaba si el fixture traía la clave `faceB` como objeto. Pero
`faceB` es **opcional** y sólo aparece cuando esa cara tuvo datos comerciales alguna
vez: `UnifiedFixture.faceB?: FaceData` (`frontend/src/types/fixtures.ts`), y el
editor 3D la guarda como `faceB: existing?.faceB` (`StoreEditor3D.tsx:4341`) — o sea,
**ausente** en toda góndola doble recién dibujada.

La app del cliente cuenta lo contrario y es la referencia: `facesOf()` en
`pages/DashboardView.tsx:148` hace `const b = f.faceB ?? EMPTY_FACE` y devuelve
**dos** caras siempre; el mapa isométrico pinta las dos mitades; y `docs/ESTADO.md`
lo dice como regla dura: *"Una góndola doble son dos espacios"*.

**Esperado vs devuelto** (góndola doble sin `faceB`, un contrato sobre la cara B):

| | esperado | devolvía | devuelve ahora |
|---|---|---|---|
| `espacios_comercializables` | **2** | 1 | **2** ✅ |
| `ocupacion_pct` | **50,0** | 0,0 | **50,0** ✅ |

**Por qué era bloqueante.** No es un caso raro: es el estado normal de toda góndola
doble a la que todavía no se le vendió la cara B, y la góndola es el mueble más común
del plano. El error entraba en el **denominador** del único porcentaje del panel, y
por lo tanto en el `ocupacion_pct` consolidado. Peor: la cara B ocupada tampoco
entraba en el numerador, así que el panel podía mostrar 0 % de ocupación sobre un
mueble que estaba vendido. `docs/ESTADO.md` además registra que el editor 3D
**borraba `faceB`** de todos los fixtures con sólo abrirse (bug ya corregido, datos
ya persistidos): hay planos vivos en ese estado.

**Cómo quedó.** La cara B se suma por `_es_gondola_doble(fixture)` a secas, con el
comentario que explica el porqué (*"Lo que hace doble a una góndola es su TIPO, no la
presencia de la clave `faceB`"*), y `backend-metricas.md` ya no dice lo contrario.

**Tests que lo fijan, ahora en VERDE** (se les sacó el `xfail`):
`test_gondola_doble_sin_faceB_cuenta_dos_caras` (unitario, y de paso comprueba que el
`gondolaType` ausente también es doble y que la **mural sigue siendo una cara**: el
arreglo no barrió con la distinción) y
`test_un_contrato_sobre_la_cara_B_ocupa_y_el_denominador_la_cuenta` (por el endpoint:
2 caras, 50,0 %).

---

### `b-2` — BLOQUEANTE (proceso) · La suite completa sale con **exit 1**: tres tests del red team quedaron desactualizados — **NUEVO, ABIERTO**

**Dónde:** `backend/tests/test_metricas_ataques.py` — **no es mi territorio y no lo
toqué.** Lo reporto porque mi verificación obligatoria es «suite completa, verde dos
veces», y no lo está. Ninguna de las tres fallas es del código de producción ni de
mi archivo.

| test | qué pasa | causa |
|---|---|---|
| `test_m26_el_cliente_suspendido_aparece_con_sus_metricas_y_sin_su_motivo` | `assert None == 2000022.0` | su cliente `beta` tiene **menos de 3 contratos**: con K=3 su `ingreso_contratado_mes` ahora es `null`. Aserto viejo. |
| `test_m29_hallazgo_un_proveedor_con_correo_en_el_nombre_filtra_el_correo` | **XPASS(strict)** | H-1 corregido (saneo del nombre): el `xfail` sobrevive al arreglo. |
| `test_m30_hallazgo_celda_de_uno_el_agregado_es_el_valor_individual` | **XPASS(strict)** | H-2 corregido (K=3): ídem. |

Las dos XPASS son exactamente el mecanismo funcionando: `strict=True` **rompe la
suite** cuando el defecto se arregla, para obligar a sacar la marca. Es lo mismo que
me pasó a mí con `b-1` y `m-1` y lo que resolví destapándolos. Falta hacerlo del otro
lado, y actualizar el número de `m26`.

**Arreglo (para el dueño de ese archivo, una pasada corta):** sacar el
`xfail(strict=True)` de `m29` y `m30`, renombrarlos como defensas, y recalcular el
aserto de `m26` — o llevar a `beta` a 3 contratos, o esperar `None` y verificar la
plata por el consolidado, que es lo que hice acá con `susp`.

**Verificado:** las tres fallas son idénticas y en el mismo lugar en las dos corridas
completas; nada intermitente y nada relacionado con el `g-1`.

---

### `M-1` — MAYOR · El `estado_cuenta` del JSON de métricas queda viejo hasta 5 minutos — **ABIERTO**

**Dónde:** `backend/app/plataforma_metricas.py` (caché) +
`backend/app/routers/plataforma.py::cambiar_estado_cliente`

**El defecto.** El `PATCH /api/plataforma/clientes/{slug}` invalida
`plataforma_estado._estado_cache` (`invalidar_cache_estado(slug)`) pero **no toca el
caché de métricas**, que guarda el cuerpo entero —`estado_cuenta` incluido— por 5
minutos. En la misma consola, el operador cambia el estado de un cliente y el JSON de
métricas sigue diciendo el estado anterior.

La spec lista entre los agregados taxativos **"estado de cuenta actual"**. Después del
PATCH no es el actual.

| | esperado | devuelto |
|---|---|---|
| `clientes[centro].estado_cuenta` tras suspender `centro` | `"suspendido"` | `"activo"` |
| `GET /api/plataforma/clientes` (mismo instante) | `"suspendido"` | `"suspendido"` ✅ |

**Dos endpoints de la misma pantalla contestan cosas distintas sobre el mismo hecho.**
Hoy la UI se salva de casualidad: `pages/Plataforma.tsx` pinta el estado desde
`GET /plataforma/clientes` y usa `/metricas` sólo para los números. Es una salvedad de
implementación, no una garantía: el campo existe en el JSON de métricas justamente
para que se pueda leer de ahí.

**Síntoma colateral, ya visible en el repo:** el test del constructor
`test_cliente_suspendido_aparece_con_sus_metricas` tiene que llamar a
`limpiar_cache_metricas()` a mano después del PATCH. Cuando un test necesita vaciar un
caché para ver el efecto de la acción que acaba de hacer, el usuario también lo va a
necesitar y no tiene cómo.

**Estado en la segunda pasada: sin corregir** — `cambiar_estado_cliente` sigue
llamando sólo a `invalidar_cache_estado(slug)`. Coincide con `H-6` del red team
(M-34), que lo encontró por su otra cara. No era bloqueante y sigue documentado.

**Arreglo sugerido (no aplicado):** o el PATCH invalida también el caché de métricas
(una `invalidar_cache_metricas()` al lado de la que ya existe), o `estado_cuenta` se
resuelve **fuera** del caché, en `metricas_del_periodo`, antes de devolver — los
estados están en el registro y se leen en una consulta.

**Test:** `test_hallazgo_M1_el_estado_del_json_de_metricas_queda_viejo_tras_el_patch`,
`xfail(strict=True)` — el único de este archivo que sigue rojo a propósito.

---

### `m-1` — MENOR · El tipo legado `gondola_doble` no se reconocía como doble — **CORREGIDO**

**Dónde:** `plataforma_metricas.py::_es_gondola_doble` — exigía `type == "gondola"`.

`pages/DashboardView.tsx:131` conserva **a propósito** el guard
`isDoubleGondolaShared(f) || f.type === "gondola_doble"`, con el comentario *"kept for
old persisted layouts"*. Un layout viejo con ese tipo contaba 2 caras en la app del
cliente y **1** en el panel del operador.

| | esperado | devolvía | devuelve ahora |
|---|---|---|---|
| caras de `{code:"GON-88", type:"gondola_doble"}` | `{X-GON-88, X-GON-88-B}` | `{X-GON-88}` | `{X-GON-88, X-GON-88-B}` ✅ |

Era menor y no bloqueante porque el pipeline actual normaliza ese tipo al importar
(`fixtureStore.ts:1284`, `FloorPlan2D.tsx:321`): sólo afectaba a snapshots viejos que
no hubieran pasado por un guardado desde entonces. Pero era exactamente la misma clase
de error que `b-1` y se arregló en la misma línea, como se había sugerido.

**Test que lo fija, ahora en VERDE:**
`test_el_tipo_legado_gondola_doble_cuenta_dos_caras` — y de paso comprueba que un
`rentable: false` sobre el tipo legado sigue excluyendo **las dos** caras, que es el
borde donde un arreglo así se pasa de rosca.

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

Es correcta, y el operador que sume la columna va a encontrar la diferencia sin tener
dónde leer por qué: el JSON no trae nada que lo explique y la pantalla tampoco.
Sugerencia (fuera de mi territorio): una nota al pie en la tarjeta del consolidado
—"usuarios distintos; una persona puede tener cuenta en varios supermercados"—.

**Se agrava con K=3**, y por eso conviene resolverlo junto: ahora hay **tres** cifras
que no suman la columna (ingreso, top de proveedores y usuarios), y sólo la tercera es
por una razón distinta. Si la pantalla no explica ninguna, el operador va a concluir
que el panel está roto; si explica la supresión, la de usuarios queda como la única
rareza sin nota.

Verificado y fijado en `test_usuarios_consolidados_son_personas_distintas_no_la_suma_de_filas`.

---

### `m-4` — MENOR / OBSERVACIÓN · El top-5 por cliente hace inauditables a los proveedores cortados

Con más de 5 proveedores en un cliente (`sur` tiene 6), su top-5 truncado **no
permite** reconstruir el consolidado desde el JSON: Familia existe, tiene un contrato
y no aparece en ninguno de los dos tops. El cálculo interno **sí** usa los conteos
completos (`_consolidar` suma `crudos["proveedores"]`, no el top truncado), así que el
número consolidado es correcto — verificado y fijado en
`test_conciliacion_del_top_de_proveedores`.

Es consecuencia sabida de que la spec pida "top 5", no un defecto. Con K=3 dejó de ser
el único agujero de auditoría del top: ahora también se pierden los proveedores de las
filas suprimidas (Zenu, entero). Se deja anotado porque quien audite esto en el futuro
va a tropezar con lo mismo.

---

### `m-5` — MENOR · La supresión K=3 también tapa el **cero**, y el cero no tiene nada que proteger — **NUEVO**

**Dónde:** `plataforma_metricas.py::_suprimir_celda_chica`, vía
`if contratos >= K_MINIMO_CONTRATOS: return publicas`.

Un cliente con **cero** contratos activos cae del lado suprimido (0 < 3) y su
`ingreso_contratado_mes` pasa de **`0.0`** a **`null`**.

| | antes | ahora | qué debería |
|---|---|---|---|
| `galerias.ingreso_contratado_mes` (0 contratos) | `0.0` | `null` | `0.0` |
| `norte.ingreso_contratado_mes` en 2026-11 (0 contratos) | `0.0` | `null` | `0.0` |

**Por qué es un defecto y no una consecuencia inocente.** La regla existe para que no
se pueda reconstruir el valor de un contrato individual. Con cero contratos **no hay
ningún contrato que reconstruir**: suprimir ahí no protege nada y sí pierde
información. Y no cualquier información: un supermercado que no facturó un peso es
justamente el que el operador tiene que llamar. Con `null` en la celda, el panel no
distingue **"no vendió nada"** de **"no te lo muestro"** — dos situaciones de negocio
opuestas que piden acciones opuestas.

Hay un argumento a favor de tapar el cero —que la distinción "suprimido vs cero"
podría filtrar que el cliente tiene 1 o 2 contratos— pero no se sostiene: el cero es
el extremo, y saber que un cliente está entre 0 y 2 contratos no revela ni el monto ni
el proveedor de ninguno, que es lo que la regla protege.

**Severidad menor y no mayor**, con el criterio de esta auditoría: el número no está
*equivocado* (no dice 5 donde hay 3), está *ausente*; y el operador tiene cómo
deducirlo mirando `ocupacion_pct == 0,0` con caras > 0. Es información degradada, no
una cifra falsa.

**Arreglo sugerido (no aplicado):** que la supresión no se aplique cuando
`contratos == 0` — `if contratos >= K_MINIMO_CONTRATOS or contratos == 0`. Una línea,
y devuelve el cero a la celda.

**No se marcó como xfail** a propósito: el comportamiento de hoy es una decisión de la
regla, no un error de cuenta, y decidir si el cero se publica es de la spec, no del
test. Se **pineó en verde** con los dos números a la vista, en
`test_ocupacion_es_null_y_no_cero_con_denominador_cero` y en
`test_mes_con_contrato_vigente_vs_mes_anterior_vs_mes_vacio`, para que el día que se
cambie el criterio el cambio sea deliberado y no un descuido.

---

### `g-1` — GAP DE PROCESO · El `rm` del gotcha R-0 no limpia el directorio temporal

El `rm` que documenta `docs/ESTADO.md` para R-0 borra `backend/retail_espacios.db` y
`backend/recabra_*.db`, pero las bases de los clientes de prueba **no viven ahí**: el
fixture `client()` de `tests/conftest.py` usa `tempfile.mkstemp()` y crea las hermanas
`recabra_*.db` al lado, en el temporal. Una corrida interrumpida deja ahí `.db` y
`.db-journal` que hacen fallar a la siguiente con
`sqlite3.OperationalError: attempt to write a readonly database` —un error que no
menciona ningún archivo y manda a buscar el problema al lado equivocado—.

Peor: el teardown de `conftest.py` borra **todos** los `recabra_*.db` del directorio
temporal (`glob.glob(os.path.join(carpeta, "recabra_*.db"))`), no sólo los suyos, así
que dos pytest simultáneos sobre el mismo `/tmp` se pisan (lo mismo que reportó el
constructor). Sugerencia: ampliar el `rm` documentado a `/tmp/recabra_*.db` y
`/tmp/*.db-journal`, o hacer que `conftest.py` use un directorio temporal propio por
sesión (`tmp_path_factory`). Las dos corridas completas de esta pasada se hicieron con
**`TMPDIR` propio** y no hubo un solo fallo fantasma.

---

## 5. Lo que se verificó y quedó bien (para que no se re-audite)

- **Forma del JSON, exacta contra la lista taxativa de la spec.** Claves de raíz, del
  consolidado, de cada fila y de cada bloque `metricas`; `ultimo_acceso` está en la
  fila y **no** en el consolidado; cada entrada del top trae exactamente
  `{nombre, contratos_activos}`; ningún top pasa de 5. **La supresión no cambia la
  forma**: los ocho campos siguen presentes en toda fila legible, con `null`/`[]` como
  valor — un campo que desapareciera sería un hallazgo, y no desaparece.
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
  con el correo del operador, la acción y el período. Se registra el **acceso**, no el
  cálculo, que es lo correcto.
- **Rangos inclusivos.** `rango_del_periodo` devuelve el mes entero, febrero de un
  bisiesto incluido; los contratos que tocan `desde` o `hasta` por un solo día cuentan,
  y los que quedan a un día de distancia no. Con K=3 el borde de `centro` —el contrato
  que arranca exactamente en `hasta`— se lee ahora por la **ocupación** (100,0 % con
  él, 50,0 % sin él), porque su plata está suprimida: el borde se sigue probando, por
  otra celda.
- **Góndola doble en sus tres formas** (con `faceB`, sin `faceB`, tipo legado) = dos
  caras; **mural** = una; `rentable:false` = ninguna, también sobre el tipo legado.
- **K=3 en su frontera** (2 vs 3) y en su propio nivel (consolidado suprimido).

---

## 6. Sobre `VERSION_POLITICA` (nota del auditor, territorio ajeno)

`features/plataforma/outputs/legal-politica.md` decide **no** subir `VERSION_POLITICA`
y tratar el punto nuevo como aclaración editorial. Desde lo que mide este endpoint, la
decisión se sostiene: el JSON auditado **no contiene un solo dato personal de un
usuario final** —ni correos, ni nombres, ni filas—; lo único cercano es
`ultimo_acceso`, que es una **fecha sin hora y sin quién**, y `usuarios_con_cuenta`,
que es un conteo. No hay tratamiento nuevo de datos personales del titular que
justifique re-consentir a todo el padrón.

El único dato de terceros que sale nominado es el **nombre de proveedor** en el top-5,
que es dato de persona jurídica en la enorme mayoría de los casos — pero no siempre
(un proveedor puede ser una persona natural con nombre propio). La segunda pasada
agregó dos defensas que **refuerzan** la decisión: el **saneo del nombre** (correos y
teléfonos enmascarados, tope de largo) y la **supresión K=3**, que además de proteger
el valor del contrato saca del JSON al proveedor único de un cliente chico. Eso queda
para el `[VALIDAR CON ABOGADO]` que la fase ya abrió, no como objeción a la versión.

---

## 7. Cómo reproducir

```bash
rm -f backend/retail_espacios.db backend/recabra_*.db
cd backend && python -m pytest tests/test_metricas_conciliacion.py -q
# 38 passed, 1 xfailed   <- el único xfail es M-1, el hallazgo que sigue abierto
```

Suite completa, dos veces, borrando las `.db` entre corridas (gotcha **R-0** de
`docs/ESTADO.md`: la suite sólo está verde la primera vez sobre un checkout sucio,
porque `tests/test_correo_api.py` importa `app.services.mailer` a nivel de módulo y
deja `app.database` clavado contra `sqlite:///./retail_espacios.db`), y con `TMPDIR`
propio por el `g-1`:

```bash
export TMPDIR=/ruta/propia/y/vacia
limpiar() { rm -f "$TMPDIR"/*.db "$TMPDIR"/*.db-journal \
                  backend/retail_espacios.db backend/recabra_*.db; }
limpiar && (cd backend && python -m pytest -q); echo "EXIT_RUN1=$?"
limpiar && (cd backend && python -m pytest -q); echo "EXIT_RUN2=$?"
```

<!-- RESULTADO_SUITE -->
