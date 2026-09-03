# Auditoría contable — P&L por sede/temporada (feature vitrinas-3d)

**Estado final, iteración 2.** Este archivo **reemplaza** el informe de la ronda 1 — no lo
duplica. Es una re-auditoría *read-only* posterior al fix de CONFLICTO-1 (prorrateo `/30`,
selección de leases por fechas, tabla `lease_cancellations`) que ejecutó `builder-rates-api`.
**No modifiqué una sola línea del repo fuera de este archivo.**

---

## Veredicto corto

**El motor de cálculo del ingreso quedó ARREGLADO. La coherencia del sistema sigue SIN cerrar,
por una decisión que no es mía.**

Las cuatro cifras que la ronda 1 declaró rotas ahora dan exactamente el número correcto, medidas
contra el mismo banco de pruebas, con la misma semilla y el mismo `HOY`:

| Prueba | Ronda 1 | Ronda 2 | Correcto |
|---|---|---|---|
| Temporada cerrada (junio, 30 d) | **$0** (−100 %) | **$1.000.000** | $1.000.000 |
| Temporada vigente (septiembre, 30 d) | **$5.500.000** (+47,1 %) | **$3.740.000** | $3.740.000 |
| Contrato de un día (27-nov) | **$2.000.000** (+2.900 %) | **$66.667** | $66.667 |
| Desvío vs tarifa de lista (sep) | **+41 %** (signo invertido) | **−4,1 %** | −4,1 % |

Y lo que quedó abierto **no se re-litiga** — el Conciliador ya dictaminó que la conciliación dual
`space_leases` vs JSON de `layout_snapshots` es un **hallazgo arquitectónico** que depende de una
decisión del maestro, no un bug de builder. Mientras esa decisión no exista, **el P&L de este
sistema no cuadra a nivel de sistema**, aunque el endpoint que lo calcula ya sea correcto: los
**$613.333 devengados invisibles en pantalla** siguen invisibles, y el mismo día de la misma sede
sigue teniendo **tres cifras de "ingreso"** distintas en tres lugares. Este informe no declara el
P&L cuadrado.

---

## 0. Alcance de la re-auditoría, método y guardrails

### Qué re-audité

Los dos ítems de verificación de `features/vitrinas-3d/spec.md`:

- [ ] **P&L cuadra vs ingresos reales**
- [ ] **Ocupación por período reflejada en colores**

sobre el árbol de trabajo después del fix (sin commitear): `backend/app/services/ocupacion.py`
(reescrito el cálculo de ingreso), `backend/app/models/models.py` (tabla nueva
`LeaseCancellation`), `backend/app/routers/spaces.py` (`cancel_lease` escribe la fila),
`frontend/src/components/Ocupacion/BarraSede.tsx` (rótulo nuevo), más lo preexistente que reporta
dinero y **no** cambió (`backend/app/routers/dashboard.py::get_kpis`,
`frontend/src/pages/DashboardView.tsx`, `frontend/src/components/Contrato/Contrato.tsx`).

### Qué NO audité, y por qué (guardrail fiscal — sin cambios respecto de ronda 1)

**No hay régimen fiscal en la spec ni en el modelo.** Re-verificado por búsqueda sobre todo el
código en esta ronda: no existe ninguna mención de IVA, retención en la fuente, ReteICA, NIT,
numeración de factura ni resolución DIAN en `backend/app/` ni en `frontend/src/`. **No lo audito
como falta**: queda como supuesto explícito en § 11.

Del mismo modo, **no hay módulo de pagos**. Todo lo que este sistema llama "ingreso" es
**devengado sobre valor contratado**, nunca caja.

### Método

Levanté la aplicación real (`TestClient` sobre `app.main`) contra una base SQLite temporal fuera
del repo, sembré por los **endpoints reales** (`POST /api/spaces/{id}/leases`,
`DELETE /api/spaces/{id}/leases/{id}`, `PUT /api/layout/{sede}`, `PUT /api/layout/rates`,
`POST /api/mounts/`), y comparé cada cifra del endpoint contra (a) una cuenta independiente en
Python y (b) una **query SQL de control** sobre la misma base. Las tres coinciden en las cuatro
temporadas (§ 2.6).

Scripts descartables, fuera del repo, en mi scratchpad: `auditoria_r2.py` (banco principal +
4 temporadas + 4 bancos aislados + SQL de control), `auditoria_r2b.py` (salto de calendario),
`auditoria_r2c.py` (huso horario en `cancelled_at`), `auditoria_r2d.py` (pruebas de aceptación
B-1 y B-7). Su semilla y sus fórmulas están íntegras abajo para que cualquiera los reconstruya
sin tenerlos.

### El banco de pruebas (misma semilla de la ronda 1, reproducible)

`HOY = 2026-09-03`. Sede **NAVE**, 5 muebles → **5 caras comercializables**:

| Mueble | Tipo | `rentable` | Caras que aporta |
|---|---|---|---|
| `PUN-04` | punta | ausente (= comercializable) | `NAVE-PUN-04` |
| `PUN-05` | punta | ausente | `NAVE-PUN-05` |
| `PUN-06` | punta | ausente | `NAVE-PUN-06` |
| `GON-01` | góndola **doble** | ausente | `NAVE-GON-01` **y** `NAVE-GON-01-B` |
| `CAJ-01` | checkout | `false` explícito | — (fuera de todo denominador) |

**Tarifa de referencia** (`app_config` → `layout_reference_rates`):
`punta = $900.000/cara/mes`, `gondola = $600.000/cara/mes`.
Techo de la sede a tarifa de lista = 3 × 900.000 + 2 × 600.000 = **$3.900.000/mes**.

**Los 9 contratos, escritos por el camino real:**

| # | Cara | Proveedor | Desde | Hasta | Mensual | Por qué está |
|---|---|---|---|---|---|---|
| 1 | `NAVE-PUN-04` | Alpina | 2026-08-15 | 2026-10-15 | $1.500.000 | cruza los DOS bordes de septiembre |
| 2 | `NAVE-PUN-05` | Nutresa | 2026-09-20 | 2026-09-25 | $1.200.000 | 6 días adentro de 30 |
| 3 | `NAVE-GON-01` | CocaCola | 2026-09-01 | 2026-09-30 | $600.000 | cara A de la góndola doble |
| 4 | `NAVE-GON-01-B` | Postobón | 2026-09-01 | 2026-09-30 | $600.000 | cara B, contrato independiente |
| 5 | `NAVE-PUN-06` | Colombina | 2026-09-01 | 2026-09-14 | $800.000 | 1 de 2 seguidos en la misma cara |
| 6 | `NAVE-PUN-06` | Colombina | 2026-09-15 | 2026-09-30 | $800.000 | 2 de 2 seguidos en la misma cara |
| 7 | `NAVE-PUN-04` | Bimbo | 2026-06-01 | 2026-06-30 | $1.000.000 | **temporada cerrada** |
| 8 | `NAVE-PUN-05` | Ramo | 2026-11-27 | 2026-11-27 | $2.000.000 | **contrato de un día** (Black Friday) |
| 9 | `NAVE-GON-01` | Zenú | 2026-12-01 | 2026-12-31 | $700.000 | **cancelado** por `DELETE .../leases/{id}` |

**JSON del layout**, escrito como lo escribe el cliente al guardar: **un contrato por cara, el
último**. Es todo lo que `UnifiedFixture` puede sostener.

**Cuatro bancos AISLADOS nuevos de esta ronda** (una sede propia cada uno, para que el número no
se mezcle con NAVE):

| Banco | Sede | Qué prueba |
|---|---|---|
| **[A]** | `CONS` | 1 cara, 2 contratos consecutivos (14 d + 16 d @ $800.000/mes) — doble conteo |
| **[B]** | `CANC` | contrato 1–30 sep @ $600.000/mes, **cancelado HOY** por el endpoint real |
| **[C]** | `HIST` | contrato de junio @ $900.000/mes, `is_active=0` **sin fila** (cancelación pre-deploy), `end_date` YA pasado |
| **[D]** | `HIS2` | contrato 1–30 sep @ $900.000/mes, `is_active=0` **sin fila**, `end_date` todavía futuro |

La regla de prorrateo que uso como verdad contable no es mía: es la del propio sistema,
`frontend/src/components/Contrato/Contrato.tsx:283` — la cifra que el proveedor **ve y firma**:

```ts
const total = Math.round((montoMensual / 30) * dias);   // dias = inclusivo en ambos extremos
```

> P&L de un período = Σ sobre cada lease de `monthly_rent / 30 × días de intersección
> inclusiva entre [lease.start, lease.end] y [desde, hasta]`.

---

## 1. Tabla ANTES / DESPUÉS por temporada

Sede NAVE, banco de 5 caras / 9 contratos, `HOY = 2026-09-03`, admin.
`GET /api/dashboard/ocupacion?sede=NAVE&desde=…&hasta=…`

| Temporada | Días | P&L correcto | **Antes** (ronda 1) | **Después** (ronda 2) | Divergencia antes | Divergencia después |
|---|---|---|---|---|---|---|
| **Junio 2026** (cerrada) `[06-01 .. 06-30]` | 30 | $1.000.000 | **$0** | **$1.000.000** | −$1.000.000 (−100 %) | **$0 (0,0 %)** |
| **Septiembre 2026** (vigente) `[09-01 .. 09-30]` | 30 | $3.740.000 | **$5.500.000** | **$3.740.000** | +$1.760.000 (+47,1 %) | **$0 (0,0 %)** |
| **27-nov 2026** (un día) `[11-27 .. 11-27]` | 1 | $66.667 | **$2.000.000** | **$66.667** | +$1.933.333 (+2.900 %) | **$0 (0,0 %)** |
| **Diciembre 2026** (futura) `[12-01 .. 12-31]` | 31 | $0 | $0 | **$0** | $0 | **$0** |

Y el techo, que en la ronda 1 tampoco prorrateaba (advertencia A-2):

| Temporada | `ingreso_a_referencia` **antes** | `ingreso_a_referencia` **después** | Desvío contratado vs lista **antes** | **después** |
|---|---|---|---|---|
| Junio (30 d) | $3.900.000 | $3.900.000 | (no medible, contratado $0) | **−74,4 %** |
| Septiembre (30 d) | $3.900.000 | $3.900.000 | **+41,0 %** ← signo invertido | **−4,1 %** ✅ |
| 27-nov (1 d) | $3.900.000 | **$130.000** (= 3,9 M × 1/30) | +1.310 % | **−48,7 %** |
| Diciembre (31 d) | $3.900.000 | **$4.030.000** (= 3,9 M × 31/30) | −100 % | −100 % |

**El número que más importa comercialmente es el de septiembre.** La pantalla imprime las dos
cifras una al lado de la otra. Antes se leía *"$5.500.000 contratado · $3.900.000 a referencia"*
→ una sede vendiendo **41 % por encima de la lista**. Ahora se lee *"$3.740.000 devengado del
período (prorrateado) · $3.900.000 a referencia (prorrateado)"* → **−4,1 %, por debajo de la
lista**, que es la verdad. **El signo se recuperó.** Es exactamente la cifra con la que se decide
si hay que subir precios o apretar la negociación.

### Salida literal del banco (septiembre, la temporada de control)

```
--- TEMPORADA VIGENTE (sep)  [2026-09-01 .. 2026-09-30] = 30 dias ---
      NAVE-PUN-04     Alpina     2026-08-15->2026-10-15 $ 1,500,000/mes x 30d = $   1,500,000
      NAVE-PUN-05     Nutresa    2026-09-20->2026-09-25 $ 1,200,000/mes x  6d = $     240,000
      NAVE-GON-01     CocaCola   2026-09-01->2026-09-30 $   600,000/mes x 30d = $     600,000
      NAVE-GON-01-B   Postobon   2026-09-01->2026-09-30 $   600,000/mes x 30d = $     600,000
      NAVE-PUN-06     Colombina  2026-09-01->2026-09-14 $   800,000/mes x 14d = $     373,333
      NAVE-PUN-06     Colombina  2026-09-15->2026-09-30 $   800,000/mes x 16d = $     426,667
   (a) P&L correcto (mensual/30 x dias) ........ $     3,740,000
   (b) ingreso_contratado del endpoint ......... $     3,740,000
       DIVERGENCIA (b-a) ....................... $             0   +0.0%
   ingreso_a_referencia ........................ $     3,900,000
   DESVIO vs lista = -4.1%
   caras=5 contratadas=5 vencidas=0 esperada=100.0% real=0.0%
```

---

## 2. Las seis verificaciones que pidió el maestro, con su número

### 2.1 Temporada cerrada de junio: prorrateo correcto, no $0 / −100 % ✅

```
--- TEMPORADA PASADA (jun)  [2026-06-01 .. 2026-06-30] = 30 dias ---
      NAVE-PUN-04     Bimbo      2026-06-01->2026-06-30 $ 1,000,000/mes x 30d = $   1,000,000
   (a) P&L correcto ............................ $     1,000,000
   (b) ingreso_contratado del endpoint ......... $     1,000,000
       DIVERGENCIA (b-a) ....................... $            -0   -0.0%
```

**Y además es ESTABLE**, que era la prueba de aceptación que escribí para B-2 ("consultarlo hoy,
mañana y en un año da lo mismo"). Medido explícitamente antes y después de disparar
`expire_leases()` por el camino de siempre (`GET /api/dashboard/kpis`):

```
[EST] junio, primera consulta:      ingreso=1,000,000  is_active(lease jun)=0
[EST] junio, tras expire_leases():  ingreso=1,000,000  is_active(lease jun)=0
[EST] ESTABLE: True
```

(La bandera ya estaba en `0` en la primera consulta porque `GET /dashboard/ocupacion` también
llama a `expire_leases()` — advertencia A-6, todavía abierta. Lo que cambió es que **ya no
importa**: la cifra no depende de la bandera.)

### 2.2 Temporada vigente ≈ $3.740.000, no $5.500.000 ✅

$3.740.000 exactos. Los $1.760.000 de sobre-declaración de la ronda 1 se descomponían así, y los
dos componentes desaparecieron:

| Concepto | Antes | Ahora | Cerrado por |
|---|---|---|---|
| Contrato #2 contado por mes entero cubriendo 6 de 30 días | +$960.000 | $0 | prorrateo `/30` |
| Contratos #5 y #6: dos meses sobre una sola cara en un mes | +$800.000 | $0 | prorrateo `/30` (los días de una cara no pueden pasar de los del período) |

### 2.3 Contrato de un día = $66.667, no $2.000.000 ✅

```
--- TEMPORADA UN DIA (27-nov)  [2026-11-27 .. 2026-11-27] = 1 dias ---
      NAVE-PUN-05     Ramo       2026-11-27->2026-11-27 $ 2,000,000/mes x  1d = $      66,667
   (b) ingreso_contratado del endpoint ......... $        66,667      DIVERGENCIA $0  (+0.0%)
   caras=5 contratadas=1 vencidas=4 esperada=20.0%
```

`docs/ESTADO.md` declara el contrato de un día como producto legítimo ("Black Friday es un
viernes suelto"). El alta lo acepta (201), la ocupación lo cuenta (`contratadas=1`) y **ahora la
plata también lo cuenta una vez, no treinta**.

### 2.4 El desvío contra referencia recupera el signo verdadero: −4,1 %, no +41 % ✅

`$3.740.000 / $3.900.000 − 1 = −4,10 %`. Medido por el endpoint, no calculado por mí.
Nota: la pantalla **deliberadamente no imprime el porcentaje** (`BarraSede.tsx` lo documenta:
"con el prorrateo el 'a referencia' puede terminar por ARRIBA o por ABAJO del contratado según el
período… se dejan las dos cifras una al lado de la otra, sin operar entre ellas"). Como auditor
lo apruebo: el ratio ya no miente, pero tampoco se ofrece sin contexto de duración.

### 2.5 Dos contratos consecutivos en la misma cara suman prorrateos sin doble conteo ✅

Banco aislado [A], sede `CONS`, **una** cara, dos contratos que entre los dos cubren septiembre
completo:

```
[A] DOBLE CONTEO — 1 cara, 2 contratos consecutivos (14d + 16d @ $800.000/mes)
    ingreso_contratado = $800,000   (correcto $800.000 · doblado seria $1.600.000)
    contratadas=1 de 1 · ref=$900,000
```

**$800.000, no $1.600.000.** El numerador de ocupación (`contratadas=1`) y el de plata ahora
cuentan la misma cara una sola vez. La invariante que escribí en B-4 se cumple:
`ingreso_de_la_cara ($800.000) ≤ tarifa_de_referencia_de_la_cara × días/30 ($900.000)`.

### 2.6 Cancelación NUEVA a mitad de plazo conserva el devengado hasta `cancelled_at` ✅

Banco aislado [B], sede `CANC`. Contrato 1–30 sep @ $600.000/mes, cancelado **hoy** (2026-09-03,
3 días corridos) por el endpoint real:

```
[B] CANCELACION NUEVA a mitad de plazo ($600.000/mes, 1-30 sep, cancelado HOY 2026-09-03)
    antes   ingreso=$600,000  contratadas=1
    despues ingreso=$ 60,000  contratadas=0   (devengado esperado 3d = $60,000)
    lease_cancellations: [(9, '2026-09-03 …'), (12, '2026-09-03 …')]
```

**$60.000 = $600.000 / 30 × 3 días, exacto.** En la ronda 1 esta misma operación llevaba el P&L
de la temporada de $600.000 a **$0**, borrando los $60.000 ya ganados. Cerrado.

La fila se escribe en la **misma transacción** que el soft-delete (`spaces.py:571`, un solo
`db.commit()` al final junto con `anotar(...)`): no hay ventana donde uno exista sin el otro.
Verificado por lectura y por la presencia de las dos filas (`lease_id` 9 = el cancelado antes de
arrancar, 12 = el cancelado a mitad de plazo).

### SQL de control — las tres cuentas coinciden

Sobre la misma base, sin pasar por la aplicación:

```sql
SELECT ROUND(SUM(l.monthly_rent *
       (JULIANDAY(MIN(COALESCE(DATE(c.cancelled_at), l.end_date), :hasta)) -
        JULIANDAY(MAX(l.start_date, :desde)) + 1)) / 30.0)
FROM space_leases l
LEFT JOIN lease_cancellations c ON c.lease_id = l.id
JOIN spaces s ON s.id = l.space_id
WHERE s.sede = 'NAVE'
  AND (l.is_active = 1 OR c.lease_id IS NOT NULL OR l.end_date < :hoy)
  AND l.start_date <= :hasta
  AND COALESCE(DATE(c.cancelled_at), l.end_date) >= :desde;
```

```
[SQL] NAVE junio       = $   1,000,000   vs endpoint $   1,000,000
[SQL] NAVE septiembre  = $   3,740,000   vs endpoint $   3,740,000
[SQL] NAVE 27-nov      = $      66,667   vs endpoint $      66,667
[SQL] NAVE diciembre   = $           0   vs endpoint $           0
```

**Cuatro de cuatro.** La cuenta independiente en Python (columna "P&L correcto" de § 1) también.

### Reproducción con `curl` contra una instancia viva

```bash
TOK=$(curl -s -XPOST "$BASE/api/auth/login" -H 'content-type: application/json' \
      -d '{"password":"…"}' | jq -r .token)

curl -s -H "Authorization: Bearer $TOK" \
  "$BASE/api/dashboard/ocupacion?sede=NAVE&desde=2026-06-01&hasta=2026-06-30" | jq
# antes → ingreso_contratado: 0.0        ahora → ingreso_contratado: 1000000

curl -s -H "Authorization: Bearer $TOK" \
  "$BASE/api/dashboard/ocupacion?sede=NAVE&desde=2026-09-01&hasta=2026-09-30" | jq
# antes → 5500000            ahora → 3740000   (ingreso_a_referencia 3900000)

curl -s -H "Authorization: Bearer $TOK" \
  "$BASE/api/dashboard/ocupacion?sede=NAVE&desde=2026-11-27&hasta=2026-11-27" | jq
# antes → 2000000            ahora → 66667     (ingreso_a_referencia 130000)
```

---

## 3. Estado de cada regla contable después del fix

Severidad: **BLOQUEANTE** = impide dar por cumplido un ítem de la spec. **ADVERTENCIA** = no
bloquea, pero deja una cifra que se lee mal.

### 3.1 Las diez reglas bloqueantes (B)

| Regla | Estado | Evidencia con número |
|---|---|---|
| **B-1** · Una sola regla de prorrateo | 🟢 **CERRADA** (con un residuo de forma) | Prueba de aceptación ejecutada, § 3.2 |
| **B-2** · Una cuenta de período jamás filtra por `is_active` | 🟡 **PARCIAL** | Plata: cerrada y estable. Conteo: sigue filtrando — § 3.3 |
| **B-3** · Cancelar no borra lo ya devengado | 🟡 **PARCIAL** | Cancelaciones nuevas: cerrada ($60.000 exacto). Históricas: § 4.1 |
| **B-4** · Prohibido sumar dos veces la misma cara | 🟢 **CERRADA** | Banco [A]: $800.000, no $1.600.000 |
| **B-5** · El dinero sale de `space_leases`; el JSON pinta | 🔴 **ABIERTA** | Canon vigente sigue en el JSON: $2.700.000 vs $3.500.000. Hallazgo arquitectónico, § 5 |
| **B-6** · "Vencida" no es un estado del período | 🔴 **ABIERTA** | dic: `vencidas=5` sobre 5 caras libres; 27-nov: `vencidas=4` |
| **B-7** · "Ocupación real" atada al contrato | 🔴 **ABIERTA** (re-medida) | § 3.4 — diciembre reporta 50 % real sin un solo montaje de diciembre |
| **B-8** · Carga masiva escribe en el plano de la sede equivocada | 🔴 **ABIERTA** | `DashboardView.tsx` no fue tocado en esa zona (diff: sólo +56 líneas, todas de la sección Ocupación) |
| **B-9** · La bitácora no cubre los caminos que mueven más plata | 🔴 **ABIERTA** | `grep -c "anotar("`: `bulk_leases.py` **0**, `planograms.py` **0**, `mounts.py` **0**, `suppliers.py` **0** |
| **B-10** · Devengado y caja no son lo mismo, y hay que decirlo | 🟡 **PARCIAL** | El rótulo dice "devengado del período (prorrateado)" ✅; no dice "no cobrado", y la franja "Canon vigente" sigue sin rótulo |

### 3.2 B-1 — la prueba de aceptación, ejecutada

La prueba que escribí en la ronda 1: *"el TOTAL DEL CONTRATO que la ficha le muestra al proveedor
debe ser igual a lo que el P&L le atribuye a ese contrato cuando el período consultado es
exactamente su plazo."*

Banco `BUNO`, contrato Alpina $1.500.000/mes, `2026-08-15 → 2026-10-15`:

```
[B-1] PRUEBA DE ACEPTACION — contrato $1,500,000/mes 2026-08-15->2026-10-15 = 62 dias
      TOTAL DEL CONTRATO que firma el proveedor (Contrato.tsx:283) . $   3,100,000
      P&L que el sistema le atribuye al plazo exacto ............... $   3,100,000
      COINCIDEN: True
```

**Coinciden al peso.** En la ronda 1 esta prueba daba ficha $3.100.000 vs P&L $1.500.000.
*(Corrección de mi propio informe anterior: escribí "61 días → $3.050.000". Son **62** días
inclusivos —17 de agosto + 30 de septiembre + 15 de octubre— y el total es **$3.100.000**. El
número de la ronda 1 estaba mal contado; el hallazgo era el mismo.)*

**Residuo de forma, no de número (ADVERTENCIA A-1):** B-1 pedía la regla escrita **una sola
vez**, espejada backend/frontend como ya se espejan `rateTypeOf`/`referenceRateFor`. Hoy el `/30`
vive en **tres** lugares con el mismo valor y sin constante compartida:
`Contrato.tsx:283`, `Contrato.tsx:417` y `services/ocupacion.py::sede_ocupacion`. Coinciden hoy;
nada garantiza que coincidan mañana. No bloquea: el número es correcto en los tres.

### 3.3 B-2 — el residuo del lado del conteo, que ahora se ve como contradicción interna

La plata dejó de filtrar por `is_active` (elegibilidad por fechas + tabla de cancelaciones). **El
conteo no.** `_cubre_periodo`, `occupancy_range` y `_es_vencida` siguen con `if not
lease.is_active: continue`. Resultado medido, **en la misma fila del mismo endpoint**:

```
--- TEMPORADA PASADA (jun) ---
   ingreso_contratado ........ $1,000,000
   caras=5 contratadas=0 esperada=0.0% real=0.0%
```

**Una temporada que reporta $1.000.000 de ingreso reporta 0 % de ocupación.** Un contador que lea
esa fila ve una sede que cobró un millón sin haber vendido nada. Y el semáforo por período dice
lo mismo:

```
[S] NAVE-PUN-04 junio (vendida el mes entero) -> {'estado': 'libre'}
```

Lo mismo pasa con la cancelación a mitad de plazo del banco [B]: `ingreso=$60.000` con
`contratadas=0`. Devengó tres días y la ocupación dice que nadie la tomó.

**Esto es nuevo como contradicción** (antes las dos mitades estaban igual de mal, y por eso no se
contradecían). Lo registro abajo como hallazgo **C-3**.

### 3.4 B-7 — re-medida en esta ronda, sigue abierta entera

`_montado_por_codigo` no cambió: toma el último reporte de `mount_confirmations` **de todos los
tiempos**, sin ninguna relación con el período consultado. Banco `BSIE`, 2 caras; una con
contrato de septiembre **y** contrato de diciembre; un único reporte "montado" hecho en
septiembre, con su foto, por el endpoint real (`POST /api/mounts/` → 201):

```
[B-7] septiembre (el contrato montado)   contratadas=1 montadas=1 real=50.0% vencidas=0
[B-7] diciembre (NADIE monto nada)       contratadas=1 montadas=1 real=50.0% vencidas=0
```

**Diciembre reporta 50 % de ocupación real sin que nadie haya montado un solo mueble de
diciembre.** `ocupacion_real_pct` sólo es válido para el período que contiene HOY, y eso hay que
decirlo en el rótulo. *(Matiz medido: la contaminación exige que la cara tenga contrato activo en
el período consultado; sin contrato, `montadas` no incrementa porque cuelga de `_cubre_periodo`.
Eso acota el daño, no lo elimina — el caso "cara revendida en dos temporadas" es el caso normal
de una punta.)*

### 3.5 Las once advertencias (A)

| Regla | Estado | Evidencia |
|---|---|---|
| **A-1** · `/30` como constante única y documentada | 🟡 **PARCIAL** | Documentada en 3 docstrings; **sin constante compartida** y **ausente de `docs/ESTADO.md`** (§ 4.4) |
| **A-2** · `ingreso_a_referencia` tampoco prorratea | 🟢 **CERRADA** | dic (31 d) = $4.030.000 = 3,9 M × 31/30; 1 día = $130.000 |
| **A-3** · Rotular el techo como techo | 🟡 **PARCIAL** | Dice "a referencia (prorrateado)"; no dice "sala completa a tarifa de lista". Junio: −74,4 % se lee como "vendimos bajo lista" cuando se vendió **1 de 5 caras** |
| **A-4** · Las caras sin tarifa tienen que declararse | 🔴 **ABIERTA** | `if ref:` en `sede_ocupacion` — la cara desaparece del techo en silencio e **infla** la captura |
| **A-5** · Borrar proveedor con historia devuelve 500 | 🔴 **ABIERTA** | `suppliers.py:96` `db.delete(supplier)`; el guard sigue contando sólo `is_active=True` |
| **A-6** · `expire_leases()` escribe dentro de peticiones GET | 🟡 **DEGRADADA a menor** | Sigue pasando, pero **ya no afecta la plata**: medido estable antes/después (§ 2.1) |
| **A-7** · Endpoints huérfanos con números que no coinciden | 🔴 **ABIERTA y AGRAVADA** | § 5 — ahora son **tres** reglas distintas, y la divergencia está **declarada como intencional** |
| **A-8** · P&L por contrato multiespacio: imposible | 🔴 **ABIERTA** | Sin cambios. Doble conteo entre caras: **descartado con número** (cada cara aporta su contrato y su tarifa) |
| **A-9** · La plata es `Float` | 🟡 **CAMBIÓ DE FORMA** | § 4.3 — el fix redondea **una vez por sede**, no por lease |
| **A-10** · `ingreso_contratado` mezcla vigente / pactado / vencido | 🟡 **PARCIAL** | Rótulo mejorado a "devengado del período"; sigue sin partirse en líneas |
| **A-11** · El total firmado no se persiste | 🟢 **CERRADA** | Con B-1 cerrada, el total es **derivable** y coincide al peso (§ 3.2) |

---

## 4. Hallazgos NUEVOS de la ronda 2

Cuatro, ninguno de ellos una regresión de las cifras que el fix arregló. Los tres primeros nacen
del mecanismo nuevo; el cuarto es de proceso.

### C-1 · BLOQUEANTE — una cancelación histórica con `end_date` ya pasado se reporta COMPLETA, como si el contrato se hubiera cumplido

La limitación que el builder documentó cubre **un** caso ("sin fila, `end_date` todavía no
pasado → no cuenta"). Hay un **segundo** caso, con el signo contrario y más caro, que no está
escrito: una cancelación anterior al deploy cuyo `end_date` original **ya pasó** cae en la rama
"temporada cerrada" y suma **el plazo entero**.

Banco aislado [C], `HIST`: contrato de junio @ $900.000/mes, cancelado el 2026-06-05 (5 días
corridos), sin fila porque la tabla no existía:

```
[C] CANCELACION HISTORICA sin fila (cancelada el 2026-06-05, pre-deploy; end_date ya paso)
    ingreso_contratado = $900,000   (devengado real 5d = $150,000)
    sobre-declara $750,000
```

**Un contrato que se cayó a los 5 días reporta el mes entero.** No es "contarlo como vencido":
es contarlo como **cumplido**.

**Y peor: el caso [D] se convierte en el caso [C] solo, con el paso del calendario.** Mismo
lease, `is_active=0` sin fila, `end_date` en el futuro. Llamando directamente a
`_ingreso_periodo_dias` con distintos "hoy" (el único parámetro que cambia; todo lo demás
idéntico):

```
Cancelacion HISTORICA sin fila (cancelada 2026-09-02 pre-deploy), contrato 1-30 sep $900.000/mes
  devengado REAL (2 dias corridos) ............... $       60,000
  P&L de septiembre consultado el 2026-09-03 ... $            0
  P&L de septiembre consultado el 2026-09-30 ... $            0
  P&L de septiembre consultado el 2026-10-01 ... $      900,000   ← salta solo
  P&L de septiembre consultado el 2027-01-01 ... $      900,000
```

**El P&L de una temporada ya cerrada cambia de $0 a $900.000 sin que nadie toque nada**, el día
que el `end_date` original queda atrás. Eso rompe la prueba de aceptación de B-2 —"consultarlo
hoy, mañana y en un año da lo mismo"— para toda esa clase de leases. En un cierre contable, un
número que se mueve solo es un número que no se puede firmar.

**Corrección posible sin migración** (la elijo así a propósito, regla dura del repo): un
*backfill* único a `lease_cancellations` para todo lease con `is_active=0` que **no** tenga fila
y cuya cancelación se pueda datar desde `audit_log` (`accion = 'contrato.baja'`,
`entidad_id = lease.id`, que hoy conserva la fecha exacta hasta los 365 días de
`bitacora.purgar()`). Para lo que ya no tenga línea de bitácora, una fila con
`cancelled_at = end_date` los deja en el comportamiento actual **de forma explícita y estable**
en vez de dejarlo librado a qué día se consulte. Es escritura de filas en una tabla nueva: no
toca ninguna columna existente. **Y hay una ventana:** cuanto antes se haga, más cancelaciones
tienen todavía su línea de bitácora viva.

### C-2 · ADVERTENCIA — `cancelled_at` es UTC y se lee como día calendario: una cancelación de la tarde devenga un día de más

`_cancelados_de` hace `cancelled_at.date()` sobre un `datetime` guardado en UTC
(`datetime.now(timezone.utc)`). Colombia es UTC−5 **todo el año**. Una cancelación hecha a partir
de las **19:00 COT** cae en el día UTC siguiente, y el corte del prorrateo se corre un día.

Medido, mismo contrato ($600.000/mes, 1–30 sep), sólo cambia la hora de la cancelación:

```
TZ del servidor: UTC
  cancelado 18:30 COT (=23:30 UTC, mismo dia habil)  -> corte 2026-09-03 -> devengado $60,000
  cancelado 20:00 COT (=01:00 UTC del dia siguiente) -> corte 2026-09-04 -> devengado $80,000
```

**+$20.000 = un día entero de más**, por cancelar a las 20:00 en vez de a las 18:30. Afecta a
**5 de las 24 horas** del día. La magnitud general es `monthly_rent / 30` por cancelación hecha
en esa ventana.

Es exactamente la clase de error que `docs/ESTADO.md` ya señala en otro lado ("`new
Date('YYYY-MM-DD')` retrocede un día en Colombia"): acá el mismo hueco entra por la puerta
contraria, convirtiendo un *timestamp* en un *día* sin decir en qué huso. *Sin migración:*
restar el offset de Colombia antes de `.date()`, o guardar el día comercial junto al timestamp.
Lo marco advertencia y no bloqueante porque el error es de un día y sólo en cancelaciones —
pero es determinístico, no aleatorio, y siempre a favor del que factura.

### C-3 · BLOQUEANTE — plata y ocupación se contradicen dentro de la misma fila

Ya descrito con su número en § 3.3: junio devuelve `ingreso_contratado = $1.000.000` junto a
`contratadas = 0` y `ocupacion_esperada_pct = 0.0`. El banco [B] devuelve `$60.000` con
`contratadas = 0`. Es el residual de B-2 del lado del conteo, y **ahora es visible** porque la
plata se arregló primero.

Arreglo consistente y barato: que `_cubre_periodo` use **la misma elegibilidad** que
`_ingreso_periodo_dias` (fechas + fila de cancelación), en vez de `is_active`. Es la misma
función de elegibilidad, aplicada a los dos numeradores. **No** hay que tocar `occupancy_range`
del semáforo con el mismo criterio sin pensarlo: ahí "cancelado no ocupa" es la regla correcta
para *vender*, mientras que para *contar la temporada pasada* la regla correcta es "ocupó los
días que ocupó". Son dos preguntas distintas sobre la misma tabla y conviene que sean dos
funciones con nombres distintos.

### C-4 · ADVERTENCIA — `ingreso_a_referencia` puede pasar del 100 % del techo mensual, y el rótulo no lo dice

Diciembre (31 días): `ingreso_a_referencia = $4.030.000` contra un techo de sala de
$3.900.000/mes. Es **correcto** bajo la convención `/30` que el sistema le firma al proveedor
(31 días facturan 31/30 de un mes), pero el rótulo "a referencia (prorrateado)" sin la duración
del período invita a leer un número mayor que la sala completa como un error de cálculo. Un
rótulo que diga la duración —"a tarifa de lista, sala completa, 31 días"— lo resuelve sin tocar
la cuenta.

---

## 5. El hallazgo arquitectónico abierto (veredicto del Conciliador — NO se re-litiga)

El Conciliador dictaminó que la conciliación entre las dos mitades del modelo dual **no es un bug
de builder**: es una decisión de arquitectura pendiente del maestro. La registro con su magnitud
—que es mi trabajo— y **no propongo re-abrir la discusión**.

### 5.1 Las tres cifras de "ingreso" de la misma sede, el mismo día — siguen siendo tres

| Cifra | Fuente | Qué pregunta contesta | Valor (NAVE, `HOY`) |
|---|---|---|---|
| **"Canon vigente"** (franja de Supervisar) | **JSON del layout** (`DashboardView.tsx`, Σ `negotiatedValue` de caras con `contractPhase === "vigente"`) | "¿cuánto cobro este mes?" | **$2.700.000** |
| `GET /api/dashboard/kpis` → `monthly_revenue` | `space_leases`, Σ `monthly_rent` corriendo HOY, **sin prorratear y sin filtro de sede** | la misma pregunta | **$3.500.000** (NAVE) |
| `GET /api/dashboard/ocupacion` → `ingreso_contratado` (sep) | `space_leases`, **prorrateado** | "¿cuánto devenga la temporada?" | **$3.740.000** |

*(El endpoint `kpis` devolvió $4.300.000 en el banco porque agrega **todas** las sedes, incluidas
las cuatro auxiliares de esta ronda; los $3.500.000 son la porción de NAVE, verificada contra la
tabla `space_leases`. Que no tenga filtro de sede es una razón más para no ponerlo al lado de una
cifra por sede.)*

**Spread entre la más alta y la más baja: $1.040.000 sobre una base real de $3.740.000 (28 %).**
Bajó desde el 75 % de la ronda 1 —el fix se llevó por delante la peor de las tres— pero **no es
cero, y las dos primeras contestan literalmente la misma pregunta desde las dos mitades del
modelo dual, difiriendo en $800.000 (23 %)**.

El builder dejó esa divergencia **declarada como intencional** en su entregable ("un admin que
compare `/dashboard/kpis` contra `/dashboard/ocupacion` va a ver dos cifras de 'ingreso' que no
coinciden, a propósito"). Como auditor: declararla es lo correcto y agradezco la honestidad, pero
**una divergencia declarada sigue siendo una divergencia**. Dos endpoints de dinero que no
concilian y que nadie puede sumar no se arreglan con un comentario en un `.md` que el admin no
lee.

### 5.2 Los $613.333 invisibles en pantalla — siguen invisibles

Conciliación fila a fila de la temporada de septiembre, re-corrida en esta ronda:

```
space_leases que tocan [2026-09-01 .. 2026-09-30] : 6
    NAVE-PUN-04     Alpina     2026-08-15->2026-10-15 $ 1,500,000/mes
    NAVE-PUN-05     Nutresa    2026-09-20->2026-09-25 $ 1,200,000/mes
    NAVE-GON-01     CocaCola   2026-09-01->2026-09-30 $   600,000/mes
    NAVE-GON-01-B   Postobon   2026-09-01->2026-09-30 $   600,000/mes
    NAVE-PUN-06     Colombina  2026-09-01->2026-09-14 $   800,000/mes
    NAVE-PUN-06     Colombina  2026-09-15->2026-09-30 $   800,000/mes

caras del JSON que tocan el mismo período : 4
SOLO EN LA BASE (invisible en toda pantalla): 2
    NAVE-PUN-05  Nutresa    2026-09-20->2026-09-25  $1.200.000/mes → prorrateado $240.000
    NAVE-PUN-06  Colombina  2026-09-01->2026-09-14  $  800.000/mes → prorrateado $373.333
SOLO EN EL JSON (sin fila normalizada): 0
```

**$613.333 de ingreso devengado real ($2.000.000 de valor mensual nominal) que existe en la
fuente normalizada y no existe en la denormalizada — el 16,4 % del P&L del período.** Idéntico a
la ronda 1: el fix no lo tocó, y no debía.

**No es un bug: es el techo estructural del modelo dual.** `UnifiedFixture` tiene exactamente
**una** tupla `(supplierName, negotiatedValue, startDate, endDate)` por cara. Una cara que se
alquila dos veces en la misma temporada —el caso normal de una punta de góndola en diciembre— **no
cabe en el JSON**. Cualquier P&L calculado desde el layout es, por construcción, un límite
inferior desconocido.

Y el mismo techo pinta el semáforo de dos colores contradictorios para el mismo período:

```
[S] NAVE-PUN-06 sep (2 contratos seguidos) backend -> {'estado': 'tomado'}
[S] NAVE-PUN-06 sep JSON -> startDate=2026-09-15 endDate=2026-09-30 -> 16/30 -> 'parcial' (naranja)
```

El semáforo ofrece como vendibles los 14 primeros días de septiembre de una punta que ya está
vendida. **Es el error que más caro sale: se vende dos veces el mismo espacio.**

### 5.3 Qué fuente usa cada pantalla que reporta dinero (actualizado)

| Pantalla / endpoint | Fuente | ¿Prorratea? | ¿Ve historia? | ¿La llama alguien? |
|---|---|---|---|---|
| Franja "Canon vigente" (Supervisar) | **JSON** | no aplica | **no** (1 contrato/cara) | sí, es la cifra principal |
| "Quién paga el canon" / "Bajo tarifa" | **JSON** | no | no | sí |
| TOTAL DEL CONTRATO (ficha de Vender) | formulario | **sí, `/30 × días`** | n/a | sí |
| `GET /dashboard/kpis` | `space_leases` | **no** | sí | **no** (huérfano) |
| `GET /dashboard/spaces` | `space_leases` | no | sí | **no** (huérfano) |
| `GET /dashboard/ocupacion` | `space_leases` | **SÍ** ✅ | **SÍ** ✅ | sí, `components/Ocupacion/` |
| `GET /spaces/{code}/rates` | `space_leases` + `app_config` | n/a (no da valor de contrato) | no | sí (3D) |
| Mapa 2D / semáforo 3D por período | **JSON** | n/a | **no** | sí |

**Sí, se siguen mezclando.** La pantalla Supervisar muestra, una debajo de la otra, una cifra de
dinero derivada del JSON (franja) y otra derivada de `space_leases` (sección Ocupación), con
reglas distintas sobre períodos distintos. La segunda ahora está **bien rotulada** ("devengado del
período (prorrateado)"), que es una mejora real y baja el riesgo de que un admin las reste. La
primera sigue sin rótulo.

---

## 6. ¿Quedó documentada la limitación de las cancelaciones históricas?

**Respuesta: SÍ, pero incompleta, y en el lugar equivocado.** Lo reporto como pedía la consigna.

**Lo que SÍ está escrito** (verificado por lectura, no por confianza):

| Dónde | Qué dice |
|---|---|
| `backend/app/services/ocupacion.py`, docstring de `_ingreso_periodo_dias` | Los tres casos de elegibilidad, y explícitamente: *"Sin fila, `is_active` False, `end_date` todavía no pasado: NO cuenta… **limitación aceptada**, no un intento fallido de adivinar"* |
| `backend/app/models/models.py`, docstring de `LeaseCancellation` | *"Un contrato cancelado ANTES de que esta tabla existiera no tiene fila acá — eso es una **limitación aceptada**, no un bug"* |
| `features/vitrinas-3d/outputs/builder-rates-api.md` | Sección "CONFLICTO-1c", con el caso y la frase "Limitación aceptada y documentada" |

**Lo que NO está escrito, y por eso lo reporto:**

1. **El caso [C] no está declarado como pérdida de exactitud.** El entregable del builder dice que
   esos leases *"quedan bajo la regla de 'temporada cerrada' si su `end_date` ya había pasado"* —
   correcto como descripción del mecanismo, pero en ningún lado dice **qué cifra sale de ahí**:
   que un contrato caído a los 5 días **reporta el mes entero** (+$750.000 en el banco). Una
   limitación documentada sin su consecuencia contable no está documentada para un contador.
2. **El salto de [D] a [C] con el paso del calendario no está en ninguna parte.** Ni en el código
   ni en el entregable. Es la parte que rompe la estabilidad del cierre (§ 4.1).
3. **`docs/ESTADO.md` no menciona nada de esto.** Verificado:
   `grep -n "lease_cancellations\|prorrat\|/30\|cancelaci" docs/ESTADO.md` → **cero coincidencias**.
   `CLAUDE.md` es explícito: *"si tu cambio altera una regla o un flujo descrito ahí, actualizalo
   en el mismo PR"*. Este cambio altera **la regla de cómo se cuenta el dinero por período** y
   agrega **una tabla nueva** al modelo. Un entregable en `features/` es la memoria de una
   iteración; `docs/ESTADO.md` es el documento vivo que la próxima sesión lee **antes de
   trabajar**. Hoy la próxima sesión no se entera de que existe `lease_cancellations` ni de que
   `/30` es la convención.

**Severidad: ADVERTENCIA** (no bloquea un ítem de la spec) **con acción concreta**: tres párrafos
en `docs/ESTADO.md` — la convención `/30`, la tabla `lease_cancellations` y su limitación con los
dos casos, y la divergencia declarada `kpis` vs `ocupacion`.

---

## 7. (c) Auditoría de trazabilidad — actualizada

### Lo que está bien y no hay que tocar

| Operación | Rastro | Verificado en esta ronda |
|---|---|---|
| Alta de contrato de a uno | `audit_log` → `contrato.alta`, con código, proveedor y fechas, **en la misma transacción** (`anotar` no hace commit propio) | sí: **14 líneas para 14 altas** |
| Baja de contrato de a uno | `audit_log` → `contrato.baja` **+ fila en `lease_cancellations`**, mismo `db.commit()` | sí: **2 bajas, 2 filas** |
| Borrado de sede | `archive_sede_spaces` **archiva** en la misma transacción: cierra leases, libera el código a `CODE#id`, guarda `original_code` en `archived_spaces`, estampa `archivado_en` en las confirmaciones de montaje. Nada se borra | sí, por lectura (sin cambios) |
| Contratos: sin borrado físico | soft-delete; **cero** `db.delete()` sobre `SpaceLease` o `Space` en todo el backend | sí, re-barrido: los 7 `db.delete(` que existen son de `auth`, `suppliers`, `catalogo`, `files`, `layout` (snapshot) y `planograms` |
| Reportes de montaje | una fila por reporte, nunca un update; manda el último por `confirmado_en` con desempate por `id`; la hora la pone el servidor | sí (sin cambios) |
| Planometría del contrato | cuelga del contrato (`lease_files`), no del mueble; no se borra al vencer | sí (sin cambios) |

### Lo que MEJORÓ con este fix

**La cancelación ahora deja fecha en el dato financiero, y esa fecha es permanente.** En la ronda
1 el único rastro de *cuándo* se canceló era la línea de `audit_log`, que `bitacora.purgar()`
borra a los **365 días** (`DIAS_QUE_SE_GUARDA = 365`, en el ciclo de mantenimiento de `main.py`).
Al año y un día, un contrato cancelado a mitad de plazo era indistinguible de uno cumplido, y ya
no quedaba dónde averiguarlo. Ahora `lease_cancellations.cancelled_at` **no se purga** y el
prorrateo se recalcula desde ahí en cualquier momento. **Este era el hueco de trazabilidad más
caro y quedó cerrado para todo lo que pase de acá en adelante.**

### Los huecos que quedan, en orden de lo que cuesta que pasen

1. **`is_active` sigue con cuatro significados** (vigente / vencido / cancelado / archivado por
   borrado de sede). `lease_cancellations` desambigua **uno** de los cuatro, y sólo hacia
   adelante. Un contador que abra `space_leases` sigue sin poder distinguir "se cumplió" de "se
   cayó" para todo lo anterior al deploy.
2. **La cancelación no registra QUIÉN ni POR QUÉ.** `lease_cancellations` tiene `id`, `lease_id`,
   `cancelled_at` — nada más. Mi propuesta original de B-2 pedía `(lease_id, cancelado_en, motivo,
   rol, ip)`. El rol y la IP están hoy en `audit_log`… que se purga a los 365 días. A partir del
   día 366: sabemos **cuándo** se canceló (permanente) pero no **quién** ni **por qué**. Son tres
   columnas más en una tabla **nueva** — cabe entero dentro de la regla dura de "sin migraciones".
3. **La carga masiva no deja bitácora** (B-9). Hasta 300 contratos por llamada, **cero** líneas.
   Es, con diferencia, el camino que más plata mueve por operación. Y como `bulk/confirmar`
   tampoco toca `lease_cancellations`, una corrección masiva tampoco deja fecha.
4. **La planometría se reemplaza con borrado físico y sin rastro.** `planograms.py:123`: subir una
   nueva hace `db.delete(vieja)`. Ninguno de los dos caminos llama a `anotar`. La anterior es
   evidencia de lo que se acordó armar — el mismo argumento por el que la foto de montaje no se
   borra.
5. **`expire_leases()` muta dentro de peticiones de lectura** sin dejar rastro (A-6). Degradado a
   menor: ya no cambia ninguna cifra de dinero (medido, § 2.1).
6. **Borrar un proveedor con historia** (A-5): el guard mira sólo contratos activos; lo que impide
   perder la historia es la restricción `NOT NULL`, que responde 500. **La historia financiera se
   salva por accidente, no por diseño.**
7. **El contrato multiespacio no existe como entidad** (A-8): no hay a qué atribuirle un P&L, y la
   agrupación derivada (proveedor + fechas + sede) se rompe con operaciones normales — cancelar
   una de tres puntas, renovar con la fecha corrida un día, o el proveedor cargado dos veces
   ("comercializadora nutresa" y "nutresa", que `docs/ESTADO.md` documenta como caso real en
   producción).

**Lo que NO encontré, y lo digo explícitamente:** ningún camino borra físicamente un contrato, un
espacio con historia, un reporte de montaje ni una foto de montaje. La regla de "nada de borrado
físico sobre registros financieros" se cumple para el núcleo. Los huecos restantes son de
**atribución** y de **cobertura de la bitácora**, no de destrucción de datos.

---

## 8. Las 13 validaciones que ya pasaban: siguen pasando

Re-corridas todas contra el código corregido, con su número:

| # | Validación | Evidencia de esta ronda |
|---|---|---|
| 1 | Denominador por **cara**, no por mueble | 3 puntas + 1 góndola doble → `caras_comercializables = 5`, con `NAVE-GON-01-B` |
| 2 | Lo no comercializable fuera de todo denominador | `CAJ-01` (`rentable: false`) excluida; los otros 4 **sin la clave** cuentan como comercializables |
| 3 | Tarifa de góndola **por cara** | techo $3.900.000 = 3 × 900.000 + **2** × 600.000 |
| 4 | Rangos inclusivos en ambos extremos | `(hasta − desde).days + 1`; contrato de un día aceptado (201) y contado (`contratadas = 1`) |
| 5 | "Se libera el" = día siguiente al fin | `lease_hasta 2026-10-15` → `se_libera_el: 2026-10-16` |
| 6 | Vencido **no** suma al ingreso vigente | `kpis.monthly_revenue` y el canon del cliente siguen filtrando por fechas de hoy |
| 7 | Contratado-que-no-arranca en su propia línea | `committedRevenue` / `upcoming_lease`, separados de lo vigente |
| 8 | **El dinero no viaja al worker** | worker recibe `['caras_comercializables','contratadas','montadas','ocupacion_esperada_pct','ocupacion_real_pct','sede','vencidas']` — `ingreso_contratado` e `ingreso_a_referencia` **ausentes**, no `null`; `/rates` de worker: `['code','occupancy','sede','type']`, `reference_rate` **ausente** |
| 9 | Sin borrado físico de registros financieros | 0 `db.delete()` sobre `SpaceLease` / `Space` (re-barrido) |
| 10 | Borrar sede archiva leases **y** confirmaciones en la misma transacción | `archive_sede_spaces` + único commit del `DELETE /layout/{sede}` |
| 11 | Histórico completo de montaje, vale el último | una fila por reporte + `row_number()` por `confirmado_en`, `id` |
| 12 | Sin doble conteo entre las caras de una góndola doble | cada cara aporta su contrato ($600.000 c/u) y su tarifa; el techo las cuenta como **dos** caras |
| 13 | Alta y baja de contrato con bitácora transaccional | 14 `contrato.alta` + 2 `contrato.baja` |

**Extra de esta ronda:** `Cache-Control: no-store, max-age=0` en `GET /api/spaces/{code}/rates`,
para admin y para worker. Es plata y ocupación en vivo: correcto que no se cachee.

**Suite del backend:** `tests/test_dashboard_ocupacion.py`, `tests/test_space_rates.py` y
`tests/test_redaction_pii.py` → **55 tests, 0 fallos** (con `TMPDIR` aislado; el propio builder
documenta el choque de `conftest.py` con corridas concurrentes en el `/tmp` compartido, que
reproduje y confirmo como artefacto de entorno, no del cambio).

---

## 9. (d) Veredicto por ítem de la spec

### `[ ] P&L cuadra vs ingresos reales` → **NO CUADRA a nivel de sistema** — pero el motor de cálculo ya es correcto

**Lo que se arregló (5 de 7 pruebas de la ronda 1 pasan ahora):**

| Prueba | Esperado | Ronda 1 | Ronda 2 | Estado |
|---|---|---|---|---|
| Temporada cerrada (jun, 30 d) | $1.000.000 | $0 | **$1.000.000** | ✅ |
| Temporada vigente (sep, 30 d) | $3.740.000 | $5.500.000 | **$3.740.000** | ✅ |
| Contrato de un día (27-nov) | $66.667 | $2.000.000 | **$66.667** | ✅ |
| Captura vs tarifa de lista (sep) | −4,1 % | +41 % | **−4,1 %** | ✅ |
| Cancelación a mitad de plazo | conserva lo devengado | borra el 100 % | **$60.000 exacto** | ✅ |
| Ficha firmada = P&L del plazo | iguales | $3.100.000 vs $0 | **$3.100.000 = $3.100.000** | ✅ |
| Canon del mes, JSON vs base | iguales | −$800.000 (−23 %) | **−$800.000 (−23 %)** | ❌ |
| Contratos del período visibles en pantalla | 6 de 6 | 4 de 6 | **4 de 6** — $613.333 invisibles (16,4 %) | ❌ |

**Lo que impide el CUADRA, y por qué no es del builder:**

1. **La divergencia dual** (§ 5): $613.333 devengados que no existen en ninguna pantalla, y tres
   cifras de "ingreso" para la misma sede el mismo día con un spread de $1.040.000 (28 %). El
   Conciliador ya dictaminó que es **arquitectónico y depende de una decisión del maestro**. No se
   re-litiga acá.
2. **C-1**: la cancelación histórica con `end_date` pasado reporta el plazo entero (+$750.000 en
   el banco) y el P&L de una temporada cerrada **se mueve solo** con el calendario ($0 →
   $900.000). Un cierre contable no puede firmarse sobre un número que cambia sin que nadie
   toque nada.
3. **C-3**: la misma fila del mismo endpoint dice $1.000.000 de ingreso y 0 % de ocupación.

**Bloqueantes que quedan para este ítem: B-5, C-1, C-3.** (B-1, B-3-nuevas y B-4: cerradas.
B-2: sólo el residuo de conteo, que es C-3.)

### `[ ] Ocupación por período reflejada en colores` → **NO CUADRA** (con la misma mitad sólida, intacta)

**Lo que está bien** — y es la mitad que más fácil se rompe, así que vale volver a escribirlo: las
13 validaciones de § 8, en particular el denominador **por cara** (5, no 4), lo no comercializable
fuera del denominador, la tarifa **por cara** de la góndola doble, los rangos inclusivos en ambos
extremos, y el dinero que **no viaja** al worker.

**Lo que no cuadra** (sin cambios respecto de la ronda 1, más el residuo nuevo):

1. **Dos fuentes pintan la misma cara de dos colores distintos para el mismo período.**
   `NAVE-PUN-06`, septiembre completo, vendida los 30 días en dos contratos consecutivos: el
   backend dice `tomado`; el 2D/3D leen el JSON, que sólo guarda el último contrato → 16 de 30
   días → **`parcial`, naranja, "se libera en el período"**. El semáforo ofrece como vendibles
   14 días de una punta ya vendida.
2. **Una temporada cerrada se pinta libre.** `occupancy_range` sigue filtrando `is_active`:
   `NAVE-PUN-04` en junio → `{'estado': 'libre'}`, habiendo estado vendida el mes entero. El
   semáforo por período no sirve para mirar hacia atrás.
3. **`vencidas` cuenta caras libres** (B-6): **5 de 5** en diciembre, **4 de 5** en Black Friday,
   sobre caras enteramente vendibles. El número sólo crece con el tiempo y nunca baja.
4. **`ocupacion_real_pct` se contamina entre temporadas** (B-7, re-medido): **50 % en diciembre**
   por un montaje reportado en septiembre.

**Bloqueantes que quedan para este ítem: B-5, B-6, B-7** (y B-8 para que el color no aparezca en
la sede equivocada).

### Nota sobre el eje de precios

`GET /api/spaces/{code}/rates` sigue bien construido para lo suyo: resuelve el tipo desde el
snapshot, normaliza con `rate_type_of` espejando al cliente, aplica el override por sede sobre la
tarifa general, arma el payload por lista blanca, exige admin también para **leer** y ahora suma
`no-store`. **No devuelve valor de contrato**, así que no participa de ninguna divergencia de
P&L. Sobre ese endpoint no tengo hallazgos contables.

---

## 10. Orden de ataque actualizado, según lo que el fix ya destrabó

El fix se llevó por delante los dos primeros escalones de la lista de la ronda 1 (B-2 del lado de
la plata y B-1), y con ellos cayó B-4. Lo que queda, reordenado por lo que **ahora** cuesta más:

1. **C-1 — el backfill de `lease_cancellations` desde `audit_log`.** Primero por dos razones: es
   la única corrección con **ventana que se cierra** (las líneas de bitácora se purgan a los 365
   días, y cada día que pasa se pierde la fecha de una cancelación más), y es la que hace que el
   P&L histórico deje de moverse solo. Sin ella, todo cierre contable anterior al deploy es
   provisional.
2. **C-3 — que `_cubre_periodo` use la misma elegibilidad que `_ingreso_periodo_dias`.** Es la
   corrección más barata del lote (una función de elegibilidad ya escrita, aplicada a un segundo
   numerador) y elimina la contradicción más visible: $1.000.000 con 0 % de ocupación en la misma
   fila.
3. **B-5 — la franja "Canon vigente" pasa a `space_leases`**, con la regla de B-1 aplicada al
   período "hoy". **Depende de la decisión del maestro sobre el modelo dual** (§ 5) y por eso no
   la pongo primera pese a ser la que más plata mueve: los $800.000 de sub-reporte y los $613.333
   invisibles no se arreglan sin esa decisión. Cuando exista, ésta es la primera implementación.
4. **B-6 y B-7 — rótulos y denominadores de ocupación.** Independientes, baratas, y son las dos
   que quedan del segundo ítem de la spec. B-6 pide una línea "libres / vendibles" en vez de
   "vencidas" para períodos futuros; B-7 pide filtrar el reporte de montaje por las fechas del
   contrato que cubre el período.
5. **C-2 — el huso de `cancelled_at`.** Un día de más por cancelación hecha después de las 19:00
   COT. Barata y determinística.
6. **A-4 y A-3 — declarar `caras_sin_tarifa` y rotular el techo con su duración.** Las dos afectan
   cómo se **lee** el desvío contra lista, que es la cifra con la que se negocia precio.
7. **B-8 y B-9 — sede equivocada en la carga masiva, y bitácora de la tanda.** Independientes de
   todo lo anterior. B-8 es un bug de datos con dinero adentro (contrato pintado en la sede
   equivocada); B-9 es el agujero de trazabilidad del camino que más plata mueve.
8. **§ 6 — los tres párrafos en `docs/ESTADO.md`.** Cuesta minutos y es la única forma de que la
   próxima sesión no vuelva a escribir un cuarto prorrateo.

Ninguna necesita migración. Las tablas nuevas que sigo proponiendo —`contract_groups` +
`contract_group_items` (A-8), opcionalmente `mount_lease_link` (B-7), y las tres columnas de
atribución en una tabla nueva junto a `lease_cancellations`— las crea
`Base.metadata.create_all()`, que es exactamente la puerta que la regla dura deja abierta y la
misma que este fix usó bien.

---

## 11. Preguntas abiertas y supuestos declarados

1. **Régimen fiscal: no especificado.** No hay IVA, retenciones, NIT ni numeración de factura en
   la spec ni en el modelo. **Supuesto explícito, no una falta.** Si el sistema va a soportar
   facturación en Colombia hay que decidirlo antes de que existan datos históricos: los montos
   guardados hoy no dicen si son con o sin IVA, y eso no se reconstruye después.
2. **`monthly_rent`: ¿antes o después de IVA?** Consecuencia directa de lo anterior. Sigue sin
   estar escrito y las dos lecturas son posibles.
3. **La convención de prorrateo `/30` quedó adoptada de hecho.** Es la que el sistema ya le firma
   al proveedor y ahora también la que calcula el P&L — y **coinciden al peso** (§ 3.2), que es lo
   que importaba. Si el negocio prefiere días reales del mes, es una decisión comercial que hoy
   se cambia en tres lugares en vez de uno (A-1).
4. **Devengado vs caja.** Sin módulo de pagos, todo es devengado. El rótulo nuevo dice "devengado
   del período (prorrateado)", que es un avance real. ¿El P&L de temporada tiene que distinguir
   contratado / facturado / cobrado? Hoy no puede.
5. **¿Qué pasa con el P&L de una sede borrada?** Ahora tiene respuesta de hecho, y es
   **inconsistente**: `archive_sede_spaces` apaga `is_active` sin escribir en
   `lease_cancellations`, así que sus leases con `end_date` **pasado** vuelven a sumar al P&L
   histórico (rama "temporada cerrada") y los de `end_date` **futuro** no suman. La misma sede
   archivada aparece o desaparece del consolidado según la fecha del contrato. **Es una decisión
   de negocio que sigo dejando abierta a propósito** —¿una sede archivada debe quedar dentro o
   fuera del P&L consolidado?— pero ahora es **urgente**, porque el sistema ya está contestando
   las dos cosas a la vez. Si la respuesta es "fuera", `archive_sede_spaces` debería escribir la
   fila de cancelación en la misma transacción en que archiva.
6. **Contrato multiespacio como entidad.** Sigo proponiendo `contract_groups` (A-8). Es la única
   forma de contestar "cuánto nos dejó este acuerdo", y hoy la pregunta no tiene respuesta
   estable. **Doble conteo entre caras: descartado con número** (cada fila cuelga de una cara
   distinta, el prorrateo por cara no se pisa, y la clave `SEDE-CODE` con `-B` está bien
   construida). El riesgo real es el otro: el P&L **por contrato** es imposible y hay que decir en
   pantalla que todo P&L de este sistema es **por cara**.
