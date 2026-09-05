# Contador Asesoría — auditoría aritmética del spread ponderado (K=3) y las cohortes

**Rol**: auditor. No toqué una línea de código de producción ni un test ajeno.
**Único archivo escrito**: `/tmp/retail-espacios-test/backend/tests/test_asesoria_contador.py` (nuevo).
**Comando de verificación** (sólo mi territorio):

```
mkdir -p /tmp/pt-contador-asesoria
cd /tmp/retail-espacios-test/backend && TMPDIR=/tmp/pt-contador-asesoria \
  python -m pytest -q tests/test_asesoria_contador.py
```

**Resultado**: `20 passed, 1 xfailed` (49 s). El `xfail` es `strict=True` y marca el
único hallazgo abierto (A1). `cd frontend && npx tsc --noEmit` limpio.

Método: todo número esperado está calculado **a mano** en constantes arriba del
archivo (estilo `test_metricas_conciliacion.py`); el test sólo compara el JSON
contra esas constantes. No se reusa ninguna función de cálculo de producción
para producir el valor esperado — si mañana cambia la fórmula, este archivo no
la sigue, la denuncia.

---

## 1. Escenario del spread, calculado a mano

Contratos sembrados con rango 2020-01-01 .. 2099-12-31 (activos en cualquier mes
en que corra la suite); período pedido = mes en curso UTC.
Una `gondola` con `gondolaType: "double"` son **dos** caras: `CODE` y `CODE-B`.

| Cliente | Tarifa sembrada | Contratos activos | Σ canon c/tarifa | Σ tarifa | c/tarifa | s/tarifa |
|---|---|---|---|---|---|---|
| **A** `clia` | `default {gondola: 1.000.000}` | 3 × 900.000 sobre `NAVE-GON-01`, `NAVE-GON-01-B`, `NAVE-GON-02` | 2.700.000 | 3.000.000 | 3 | 0 |
| **B** `clib` | `default {gondola: 1.000.000}` | 2 × 900.000 | 1.800.000 | 2.000.000 | 2 | 0 |
| **C** `clic` | — (ninguna) | 4 × 1.111.111 | 0 | 0 | 0 | 4 |
| **D** `clid` | `default {gondola: 1.000.000}` + `by_sede {NAVE: {gondola: 2.000.000}}` | 3 × 1.500.000 en NAVE + 1 × 800.000 en SUR + 1 × 500.000 sobre `FANTASMA-01` (fuera del plano) | 5.300.000 | 7.000.000 | 4 | 1 |
| `roto` | — | base ilegible | — | — | — | — |
| `galerias` | — | vacío (viene con la instalación) | 0 | 0 | 0 | 0 |

Cuentas a mano:

- **A**: `(2.700.000 / 3.000.000 − 1) × 100 = (0,9 − 1) × 100 = −10,0`
- **D**: `5.300.000 / 7.000.000 = 0,7571428571428571`; `(… − 1) × 100 = −24,285714285714288` → `round(·, 1) = −24,3`
- **Consolidado**: `Σ canon = 2.700.000 + 1.800.000 + 0 + 5.300.000 = 9.800.000`;
  `Σ tarifa = 3.000.000 + 2.000.000 + 0 + 7.000.000 = 12.000.000`;
  `Σ contratos c/tarifa = 3 + 2 + 0 + 4 = 9 ≥ 3`;
  `9.800.000 / 12.000.000 = 0,81666…` → `−18,3333…` → **`−18,3`**
- **La cuenta equivocada** (promedio aritmético de los spreads *publicados*, A y D):
  `(−10,0 + (−24,3)) / 2 = −17,15` ≠ `−18,3`. Difieren: el ponderado es el que sale.
- **Sin B** (si suprimir una fila cambiara el total): `8.000.000 / 10.000.000 → −20,0` ≠ `−18,3`.
  Es decir, B **entra** al consolidado aunque su fila salga suprimida por K=3. Verificado.

---

## 2. Tabla de verificaciones

| # | Verificación | Esperado (a mano) | Obtenido | Veredicto |
|---|---|---|---|---|
| 1 | A: spread con 3 contratos y tarifa default | `spread_pct = −10.0`, `tarifa_configurada = true`, `contratos_sin_tarifa = 0`, `canon_promedio_mensual = 900000.0`, `ingreso = 2.700.000` | idéntico | ✅ |
| 2 | B: 2 contratos → K=3 | `spread_pct = null`, `tarifa_configurada = true`, `canon_promedio_mensual = null`, `ingreso = null` | idéntico | ✅ |
| 3 | C: sin tarifa configurada | `spread_pct = null`, `tarifa_configurada = false`, `contratos_sin_tarifa = 4`, `ingreso = 4.444.444` | idéntico | ✅ |
| 4 | D: `by_sede` gana al `default`; código fuera del plano no entra al spread pero sí al ingreso | `spread_pct = −24.3`, `contratos_sin_tarifa = 1`, `ingreso = 5.800.000`, `canon_prom = 1.160.000` | idéntico | ✅ |
| 4b | Tipo sin entrada de tarifa (`nevera` con `default {gondola: …}`) | cuenta en `contratos_sin_tarifa` (=1); spread de las 3 góndolas = `−10.0`; `ingreso = 3.100.000` (la nevera sí suma plata) | idéntico | ✅ |
| 5 | Góndola doble: la cara `-B` usa la MISMA tarifa por cara que la A | `_mapa_tipos_de_sede` mapea `NAVE-GON-01-B → ("NAVE","gondola")`; A con 2 de 3 contratos sobre una doble da `contratos_sin_tarifa = 0` y `−10.0` | idéntico | ✅ |
| 6 | Consolidado ponderado Σ/Σ, con B adentro pese a estar suprimido | `spread_pct = −18.3`, `clientes_con_tarifa = 3` (A, B, D); ≠ `−17,15` (promedio de spreads); ≠ `−20,0` (sin B); `roto` no suma y `clientes_con_error = 1` | idéntico | ✅ |
| 7 | Consolidado K=3: sólo B legible con tarifa (2 contratos) | `consolidado.spread_pct = null`, `clientes_con_tarifa = 1` | idéntico | ✅ |
| 8 | Redondeo periódico: 3 × 333.333 contra 1.000.000 | `999.999 / 3.000.000 = 0,333333` → `−66,6667` → **`−66.7`**, exactamente 1 decimal en el JSON | idéntico | ✅ |
| 8b | Ninguna tarifa absoluta en el JSON | ni `1.000.000`, ni `2.000.000`, ni ninguna Σ tarifa (`3.000.000`, `2.000.000`, `7.000.000`, `12.000.000`) entre los números del cuerpo | ninguno aparece | ✅ |
| 9 | `/tendencia?cliente=clia` y `?cliente=__consolidado__` sin campos nuevos | `spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa` ausentes en cada punto de `serie` y en el JSON serializado | ausentes | ✅ |
| 10 | Forma de `/adopcion` | claves exactas `{periodo, generado_en, cohortes, clientes}`; por cliente las 10 del contrato; por cohorte las 8; **ninguna arroba** en el cuerpo | idéntico | ✅ |
| 10a | Clasificación por caso sembrado | `afantasma`→fantasma, `bactiva`→activa, `cnueva`→nueva, `dsincuenta`→sin_cuentas, `edormida`→dormida, `fnunca`→fantasma, `hbordealta`→fantasma, `galerias`→sin_cuentas | idéntico | ✅ |
| 10b | `dias_sin_acceso` / `usuarios_activos_30d` | 45 y 0 (`afantasma`); 3 y 1 (`bactiva`); `null` con contratos (`fnunca`); membresía desactivada → `usuarios_con_cuenta = 0` y `dias_sin_acceso = null` | idéntico | ✅ |
| 10c | Precedencia: `nueva` gana a `fantasma` | alta hace 10 días, con contratos, cero accesos → `nueva` | `nueva` | ✅ |
| 10d | Borde: alta hace **exactamente** 30 días → NO `nueva` | `fantasma` (30 no es "< 30") | `fantasma` | ✅ |
| **10e** | **Borde: login hace exactamente 30 días → `activa`** (contrato: `ultimo_login.date() ≥ hoy − 30`) | `usuarios_activos_30d = 1`, `clasificacion = "activa"` | `usuarios_activos_30d = 0`, `clasificacion = "dormida"` | ❌ **HALLAZGO A1** — `xfail(strict=True)` |
| 11 | Cohorte por mes de alta, dos fuentes | `koa` (F 2025-01-10), `kob` (F 2025-01-25), `kod` (F 2025-01-08) → `2025-01`; `koc` (F 2025-03-05) → `2025-03`; `koe` (sin `Fundacion`, `ClienteRow.creado` NULL) → `null`; `galerias` → `null` | idéntico | ✅ |
| 11b | Retención y cierre del desglose | `2025-01`: 3 clientes, 1 con acceso en 30 d → `round(1×100/3, 1) = 33.3`; `2025-03`: 1 cliente, `0.0`; `null`: 2 clientes. Σ de las 5 clasificaciones = `clientes` en cada cohorte; Σ `cohortes.clientes` = `len(clientes)` | idéntico | ✅ |
| 11c | Sin `Fundacion` pero con `ClienteRow.creado` (2024-07-21) → `2024-07` | 200 y cohorte `"2024-07"` | idéntico | ✅ (regresión del **HALLAZGO A2**, ya corregido) |
| 12 | Orden de `cohortes` y de `clientes` | cohortes `["2025-01", "2025-03", null]`; clientes ordenados por `(fantasma, dormida, sin_cuentas, nueva, activa)` y luego slug; el primero es `fantasma` | idéntico | ✅ |

---

## 3. Hallazgos

### A1 — ABIERTO · `usuarios_activos_30d` excluye el día 30 (contrato dice que lo incluye)

**Archivo**: `backend/app/plataforma_adopcion.py:100-102`

```python
usuarios_activos_30d = sum(
    1 for d in logins if d is not None and (hoy - d).days < DIAS_RECIENTE
)
```

- **Contrato del Maestro**: «`usuarios_activos_30d` = usuarios con `ultimo_login.date() ≥ hoy − 30 días`»
  y, explícitamente, «login hace exactamente 30 días (¿activa o no? el contrato dice `≥ hoy−30` → **activa**)».
- **Esperado** para un usuario con `ultimo_login` = hoy − 30 días: `usuarios_activos_30d = 1`, `clasificacion = "activa"`.
- **Obtenido**: `0` y `"dormida"` (o `"fantasma"` si el cliente tiene contratos), porque `30 < 30` es falso.
- **Impacto**: no es sólo esa fila. La **retención por cohorte** se calcula sobre
  `usuarios_activos_30d >= 1`, así que toda cohorte con un cliente en el día 30
  exacto reporta un punto de retención de menos, y ese cliente entra a la lista
  de "a quién llamar hoy" sin corresponder.
- **Arreglo**: `<= DIAS_RECIENTE`.
- **Dejado como test que falla**:
  `tests/test_asesoria_contador.py::test_10e_login_de_exactamente_30_dias_es_activa`,
  marcado `@pytest.mark.xfail(strict=True, reason="HALLAZGO A1 …")`. Con `strict=True`,
  en cuanto el builder lo arregle el test pasa a XPASS y **rompe la suite**, obligando
  a quitar la marca — no se puede olvidar arreglado a medias.

> Nota de simetría: el otro borde, `dias_desde_alta < DIAS_RECIENTE` para `nueva`
> (línea 85), **sí** es correcto — la spec dice "alta hace **menos** de 30 días",
> y 30 no es menos de 30. Verificado en `test_10d`. Los dos umbrales usan hoy el
> mismo operador y la spec pide operadores distintos; el arreglo de A1 debe tocar
> sólo la línea 101.

### A2 — YA CORREGIDO (durante esta sesión) · `/adopcion` devolvía 500 con cualquier cliente sin `Fundacion`

**Archivo**: `backend/app/plataforma_adopcion.py:106-111`

Código en el momento de detectarlo:

```python
alta = alta_por_slug.get(slug) or cliente_row.creado
if alta is not None and not isinstance(alta, date):
    alta = alta.date()
...
dias_desde_alta = (hoy - alta).days if alta is not None else None
```

`datetime` **es** subclase de `date`, así que `isinstance(alta, date)` daba `True`
también para el `datetime` de `ClienteRow.creado` y la reducción a día nunca corría.
La línea siguiente reventaba con:

```
TypeError: unsupported operand type(s) for -: 'datetime.date' and 'datetime.datetime'
```

- **Alcance**: cualquier cliente **sin** `Fundacion` y **con** `ClienteRow.creado`, es decir
  todo el parque anterior al alta self-service de Fase 2 — incluido el `galerias` que
  trae la instalación por defecto. El `except` por cliente no existe en
  `calcular_adopcion`, así que la excepción subía y `GET /api/plataforma/adopcion`
  devolvía **500 para el panel entero**, no una fila con `error`.
- **Estado**: el builder backend lo corrigió en paralelo, en el mismo árbol, a
  `if isinstance(alta, datetime): alta = alta.date()`. Verificado corriendo mi test.
- **Test de regresión** (ahora verde, sin `xfail`):
  `test_11c_cliente_sin_fundacion_usa_la_fecha_de_ClienteRow`.

### A3 — NO es un defecto del código · desliz aritmético en el enunciado de la verificación 4

El brief del Maestro dice, para el cliente D: «el ingreso incluye los 5 contratos
(**7.300.000**)». Con los mismos 5 contratos que fija la propia fórmula del brief
(`(4.500.000 + 800.000) / (6.000.000 + 1.000.000)`), el ingreso es
`4.500.000 + 800.000 + 500.000 = **5.800.000**`. 7.300.000 correspondería a
**cuatro** contratos de 1.500.000 (`6.000.000 + 800.000 + 500.000`), que
contradiría la Σ tarifa de 6.000.000 = 3 × 2.000.000 de la misma línea.
Auditado contra **5.800.000**, que es lo consistente con la fórmula vinculante,
y el código da eso. Ningún cambio pedido; queda anotado para que el Verificador
no lo lea como una regresión.

---

## 4. Riesgo residual que la spec ACEPTA con K=3 (documentado, no bloqueante)

La decisión de privacidad de la spec es vinculante y esta auditoría **no la
objeta**; sólo deja escrito el costo exacto que se acepta al firmarla.

Con un cliente que tenga **exactamente 3 contratos con tarifa aplicable, todos
del mismo tipo, y `contratos_sin_tarifa = 0`**, la tarifa de referencia de ese
tipo se despeja del JSON público con aritmética de escuela:

```
tarifa_del_tipo = ingreso_contratado_mes / (1 + spread_pct / 100) / contratos
```

Con mis datos sembrados del **cliente A** (`clia`), que es exactamente ese caso —
3 contratos de 900.000 sobre góndolas, tarifa `default {gondola: 1.000.000}`:

| Campo publicado en `/metricas` | Valor |
|---|---|
| `ingreso_contratado_mes` | `2.700.000` |
| `spread_pct` | `−10.0` |
| `contratos_sin_tarifa` | `0` |
| `canon_promedio_mensual` | `900.000` |

```
2.700.000 / (1 + (−10,0 / 100)) / 3
= 2.700.000 / 0,9 / 3
= 3.000.000 / 3
= 1.000.000     ← la tarifa de referencia de `gondola`, exacta
```

(Equivalentemente, sin usar el ingreso: `canon_promedio_mensual / (1 + spread_pct/100)`
= `900.000 / 0,9` = `1.000.000`.)

Es decir: **K=3 protege el spread de 1 y 2 contratos, pero en el caso mono-tipo con
exactamente 3 y sin contratos sin tarifa, el spread + el canon promedio (que ya se
publicaba desde Fase 4) reconstruyen la tarifa absoluta con error cero.** La
protección se degrada rápido en cuanto hay mezcla: con dos tipos distintos, o con
`contratos_sin_tarifa > 0`, el sistema queda subdeterminado (una ecuación, dos o
más incógnitas) y sólo se despeja una tarifa *promedio ponderada* de la canasta,
no la de un tipo.

Por qué **no** lo elevo a hallazgo bloqueante:

- La spec lo asume explícitamente en su motivación de K=3 («con 1 o 2 contratos el
  spread y el canon promedio (que sí se publica) dejan despejar la tarifa») — la
  aritmética es la misma con 3; lo que cambia es sólo el umbral elegido.
- Subir el umbral **sólo para el spread** (K=5, digamos) haría que `spread_pct` sea
  `null` en la mayoría de los clientes de primer mes, que es justo el segmento al
  que la asesoría le quiere vender la lectura.
- Y hay una asimetría de daño respecto al canon: la tarifa de referencia es un
  número que el propio cliente configuró y que ya se le pide al operador para
  asesorarlo, no un dato de un tercero.

**Mitigaciones posibles si el negocio cambia de opinión** (no implementadas, no pedidas):
(a) exigir además ≥ 2 *tipos* distintos con tarifa para publicar `spread_pct`;
(b) suprimir el spread cuando `contratos_sin_tarifa == 0 and contratos_con_tarifa == K`;
(c) publicar el spread redondeado a 0 decimales, que convierte el despeje exacto en
un intervalo (con `−10 %` a un decimal el intervalo ya es de ±0,05 %, ~±550 pesos
sobre 1.000.000 — protección nula en la práctica).

---

## 5. Qué NO audité (fuera de mi territorio)

- Autorización de `/adopcion` (operador 200 / dueño 403 / sin token 401) y la
  bitácora `accion="adopcion"` — es territorio del red-team / builder backend;
  yo verifiqué sólo que no haya arrobas en el cuerpo.
- Frontend (`Plataforma.tsx`, `consola.tsx`), capturas claro/oscuro.
- `docs/legal/politica-datos.md` §5.3 y su copia byte-idéntica.
- La suite completa (la corre el Verificador, en serie). Corrí **sólo**
  `tests/test_asesoria_contador.py`, con `TMPDIR=/tmp/pt-contador-asesoria`.
  No borré ninguna `backend/*.db` que no hubiera creado mi propio teardown.
- No hice commit ni push.
