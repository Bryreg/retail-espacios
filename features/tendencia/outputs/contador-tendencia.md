# Contador — auditoría numérica de la serie de tendencia (Fase 5)

**Alcance**: ¿la serie que devuelve `GET /api/plataforma/tendencia` cuadra contra
datos sembrados a mano en tres meses, por cliente y en el consolidado ponderado,
con K=3 y saneo aplicados **por mes**?

**Territorio**: `backend/tests/test_tendencia_conciliacion.py` (nuevo, 21 funciones →
23 casos con la parametrización).
No se tocó `app/**` ni ningún otro test. Los bugs se reportan, no se arreglan.

**Método**: períodos RELATIVOS al mes en curso (`M`, `M-1`, `M-2`) — la serie
siempre termina en el mes en curso, así que sembrar meses fijos haría caducar la
auditoría el 1º del mes que viene. Cada número está calculado a mano en el
comentario del test. Los helpers (`Identidades`, `_fundar`, `_sembrar`,
`_romper`, `_operador_sin_membresias`, `_cab`) están **copiados** de
`test_plataforma_metricas.py`, no importados: un test de conciliación que importa
del test que audita hereda sus errores.

**Veredicto**: **la aritmética de la serie está bien**. Los 40 números
auditados (ocupación, ingreso, canon promedio, top, usuarios, forma) salen
exactos, por cliente y consolidados, en los tres meses. **Un bug bloqueante**
(BUG-1) en el poblado: el consolidado de un mes pasado puede quedar congelado
contradiciendo a sus propios sumandos. Y la suite entera queda en **exit 1** por
un flake de `test_recordatorios.py` que la Fase 5 parece haber destapado (BUG-3).

---

## Escenario 1 — Serie por cliente, tres meses

**Sembrado** (acme, sede NAVE, 4 muebles → **5 caras**: `PUN-01`, `GON-01`
góndola **doble** → `GON-01` + `GON-01-B`, `GON-02` mural, `CHK-01`):

| # | espacio | proveedor | vigencia | canon | activo |
|---|---|---|---|---|---|
| C1 | NAVE-PUN-01 | Alpina | M-2 .. M-2 | 300.000 | sí |
| C2 | NAVE-GON-01 | Bimbo | M-2 .. M-2 | 200.000 | sí |
| C3 | NAVE-GON-02 | Alpina | M-2 .. M | 100.000 | sí |
| C4 | NAVE-GON-01-B | Bimbo | M-1 .. M | 400.000 | sí |
| C5 | NAVE-CHK-01 | Nutresa | M .. M | 600.000 | sí |
| C6 | NAVE-PUN-01 | Alpina | M .. M | 250.000 | sí |
| C7 | FANTASMA-99 (fuera del plano) | Fantasma SA | M-1 .. M-1 | 700.000 | sí |
| C8 | NAVE-GON-01 | Cancelada | M-2 .. M | 9.999.999 | **NO** |

| mes | activos (a mano) | métrica | esperado (a mano) | obtenido | |
|---|---|---|---|---|---|
| **M-2** | C1,C2,C3 = 3 | ocupación | 3/5 = **60.0 %** | 60.0 | OK |
| | | ingreso | 300k+200k+100k = **600.000,00** | 600000.0 | OK |
| | | canon prom. | 600.000/3 = **200.000,00** | 200000.0 | OK |
| | | top | Alpina 2, Bimbo 1 | ídem | OK |
| **M-1** | C3,C4,C7 = 3 | ocupación | 2/5 = **40.0 %** (FANTASMA no está en el plano: suma plata, no cara) | 40.0 | OK |
| | | ingreso | 100k+400k+700k = **1.200.000,00** | 1200000.0 | OK |
| | | canon prom. | 1.200.000/3 = **400.000,00** | 400000.0 | OK |
| | | top | Alpina 1, Bimbo 1, Fantasma SA 1 (empate → alfabético) | ídem | OK |
| **M** | C3,C4,C5,C6 = 4 | ocupación | 4/5 = **80.0 %** | 80.0 | OK |
| | | ingreso | 100k+400k+600k+250k = **1.350.000,00** | 1350000.0 | OK |
| | | canon prom. | 1.350.000/4 = **337.500,00** | 337500.0 | OK |
| | | top | Alpina 2, Bimbo 1, Nutresa 1 | ídem | OK |
| los 3 | — | `espacios_comercializables` | **5** (la góndola doble cuenta 2 caras sin `faceB`) | 5 | OK |
| los 3 | — | contrato cancelado (C8) | no aparece nunca: 9.999.999 ausente del JSON y del crudo (M-2 = 3 contratos, no 4) | ídem | OK |
| — | — | orden y nombre | `[M-2, M-1, M]`, `nombre = "Acme"` | ídem | OK |

Tests: `test_serie_por_cliente_tres_meses[M2|M1|M]`,
`test_contrato_cancelado_no_cuenta_en_ningun_mes`.

---

## Escenario 2 — Consolidado PONDERADO (Σ/Σ), nunca promedio de promedios

**Sembrado**, mes en curso, tamaños deliberadamente incomparables:

- **acme**: 10 góndolas dobles = **20 caras**; 2 contratos de $100 sobre 2 caras
  → 10.0 % · canon propio $100,00 · **su fila sale suprimida (2 < K=3)**.
- **beta**: 2 puntas = **2 caras**; 8 contratos de $1 sobre esos 2 espacios
  → 100.0 % · canon propio $1,00.
- Usuarios: dueña de acme + dueño de beta + **una persona con membresía activa en
  los dos**.

| métrica | cuenta correcta (Σ/Σ) | cuenta EQUIVOCADA | obtenido | |
|---|---|---|---|---|
| `espacios_comercializables` | 20+2 = **22** | — | 22 | OK |
| `ocupacion_pct` consolidado | (2+2)/(20+2) = 4/22 = 18,1818… → **18.2** | promedio de %: (10+100)/2 = **55.0** | 18.2 (y ≠ 55.0) | OK |
| `ingreso_contratado_mes` | 200 + 8 = **208,00** | — | 208.0 | OK |
| `canon_promedio_mensual` | 208/10 = **20,80** | promedio de promedios: (100+1)/2 = **50,50** | 20.8 (y ≠ 50.5) | OK |
| acme (fila propia) | suprimida: ingreso `null`, canon `null` | — | `null` / `null` | OK |
| acme / beta `ocupacion_pct` | 10.0 / 100.0 | — | 10.0 / 100.0 | OK |
| `usuarios_con_cuenta` consolidado | **3 DISTINTAS** | suma por cliente: 2+2 = **4** | 3 (y ≠ 4) | OK |
| `usuarios_con_cuenta` acme / beta | 2 / 2 | — | 2 / 2 | OK |

El aporte de acme ($200) entra en el total consolidado **aunque su propia fila
esté suprimida** — suprimir una fila no puede cambiar el total del negocio.

Tests: `test_consolidado_ocupacion_es_ponderada`,
`test_consolidado_canon_es_ponderado`, `test_consolidado_usuarios_son_distintos`.

---

## Escenario 3 — K=3 aplicado POR MES en el histórico

**Sembrado**: acme (5 caras: PUN-01, PUN-02, GON-01 doble, CHK-01) y beta
(2 caras).

| mes | acme | beta | consolidado |
|---|---|---|---|
| M-2 | A1 $100 + A2 $200 → **2 contratos** | B1 $1.000 + B2 $2.000 → 2 contratos | 4 contratos |
| M-1 | A3 $300 + A4 $400 + A5 $500 → **3 contratos** | 0 | 3 contratos |
| M | A5 $500 → **1 contrato** | 0 | **1 contrato** |

| punto | métrica | esperado (a mano) | obtenido | |
|---|---|---|---|---|
| acme M-2 | ingreso / canon / top | **`null` / `null` / `[]`** (2 < 3) | ídem | OK |
| acme M-2 | ocupación, caras, sedes | **40.0 % (2/5), 5, 1** — los conteos NO se suprimen | 40.0 / 5 / 1 | OK |
| acme M-1 | ingreso | 300+400+500 = **1.200,00** | 1200.0 | OK |
| acme M-1 | canon prom. | 1.200/3 = **400,00** | 400.0 | OK |
| acme M-1 | ocupación | 3/5 = **60.0 %** | 60.0 | OK |
| acme M-1 | top | Alpina 1, Bimbo 1, Nutresa 1 | ídem | OK |
| acme M | ingreso / canon / top | **`null` / `null` / `[]`** (1 < 3) | ídem | OK |
| acme M | ocupación | 1/5 = **20.0 %** | 20.0 | OK |
| **cons. M-2** | ingreso | 300 (acme, suprimida) + 3.000 = **3.300,00** ← incluye a acme | 3300.0 | OK |
| cons. M-2 | canon prom. | 3.300/4 = **825,00** | 825.0 | OK |
| cons. M-2 | ocupación | (2+2)/(5+2) = 4/7 = 57,142… → **57.1 %** | 57.1 | OK |
| cons. M-2 | top | Nutresa 2, Alpina 1, Bimbo 1 | ídem | OK |
| cons. M-1 | ingreso / canon / ocup. | **1.200,00 / 400,00 / 42.9 %** (3/7) | ídem | OK |
| **cons. M** | ingreso / canon / top | **`null` / `null` / `[]`** — toda la plataforma < 3 | ídem | OK |
| cons. M | ocupación / caras | 1/7 = **14.3 %** / **7** | 14.3 / 7 | OK |

Tests: `test_k3_por_mes_en_la_serie_del_cliente`,
`test_consolidado_usa_los_datos_subyacentes_del_cliente_suprimido`,
`test_plataforma_entera_bajo_k3_suprime_el_consolidado`.

---

## Escenario 4 — Saneo del proveedor AL LEER

Sembrado: `"Juan Pérez (juan@x.co) 3001234567"` en 3 contratos (para que el top
no caiga por K=3).

| paso (a mano) | resultado |
|---|---|
| 1. correo `juan@x.co` → `[correo oculto]` | `Juan Pérez ([correo oculto]) 3001234567` |
| 2. teléfono (10 dígitos ≥ 7) → `[teléfono oculto]` | **`Juan Pérez ([correo oculto]) [teléfono oculto]`** |

| verificación | esperado | obtenido | |
|---|---|---|---|
| `top_proveedores[0].nombre` (acme y consolidado) | el saneado de arriba | ídem | OK |
| ningún string del JSON con `@` | 0 ocurrencias | 0 | OK |
| ningún string con `3001234567` ni `x.co` | 0 ocurrencias | 0 | OK |

**Nota de alcance** (no es un bug): el saneo NO borra el nombre de la persona
(`"Juan Pérez"` sobrevive), sólo el correo y el teléfono. Es lo que ya definió la
Fase 4 y la serie lo hereda tal cual; lo dejo anotado porque `Supplier.name` sigue
siendo el único string de negocio que sale al operador.

Test: `test_saneo_del_proveedor_en_la_serie`.

---

## Escenario 5 — Congelado vs convergencia, e idempotencia

Base: acme con 3 contratos en M-1 ($100+$200+$300 = 600) y 3 en M (idem 600).

| caso | esperado (a mano) | obtenido | |
|---|---|---|---|
| M-1: pedir /metricas → ingreso | **600,00** | 600.0 | OK |
| M-1: sembrar $5.000 más, repedir (caché limpio) | **sigue 600,00**; `capturado_en` idéntico; "Tardio SA" ausente del top | ídem | OK |
| M: pedir /metricas → ingreso, canon | **600,00 / 200,00** | ídem | OK |
| M: sembrar $5.000 más, repedir | **5.600,00** y canon 5.600/4 = **1.400,00**; `parcial: true` | ídem | OK |
| 4 pedidos × 2 períodos | **1 sola fila** por (`acme` / `galerias` / `__consolidado__`, período) | 1 c/u | OK |

Tests: `test_mes_pasado_queda_congelado`, `test_mes_en_curso_converge`,
`test_idempotencia_una_fila_por_cliente_y_periodo`.

---

## Escenario 6 — Cierre automático

Sin abrir `/metricas` en ningún momento.

| caso | esperado (a mano) | obtenido | |
|---|---|---|---|
| `cerrar_mes_anterior()` → M-1 de acme | `sin_dato: false`, `origen: "cierre"`, ingreso **600,00**, canon **200,00**, ocupación **60.0 %** (3/5), `parcial: false` | ídem | OK |
| consolidado M-1 tras el cierre | ingreso **600,00**, `clientes_incluidos: 2` (galerias + acme), `clientes_con_error: 0` | ídem | OK |
| el mes EN CURSO tras el cierre | `sin_dato: true` (el cierre no lo toca) | ídem | OK |
| llamarlo 2 veces más, con un contrato nuevo sembrado en M-1 | mismas filas, mismos valores (no duplica ni cambia) | ídem | OK |
| `_run_lease_maintenance()` en vez de la función suelta | M-1 con `origen: "cierre"` | ídem | OK |
| con un cliente `roto` | acme cierra igual (600,00); consolidado `clientes_con_error: 1`, `clientes_incluidos: 2`; **roto sin fila** y su serie con `sin_dato: true` | ídem | OK |

Tests: `test_cierre_automatico_pone_el_mes_anterior`,
`test_cierre_repetido_no_duplica_ni_cambia`,
`test_cierre_con_un_cliente_roto_cierra_igual_al_resto`,
`test_run_lease_maintenance_dispara_el_cierre`.

---

## Escenario 7 — Forma de la serie

| verificación | esperado | obtenido | |
|---|---|---|---|
| `meses=6` | **exactamente 6** entradas, `meses: 6` | 6 | OK |
| orden | consecutivas, del más viejo al más nuevo (`ultimos_periodos(6, M)`), `sorted()` idéntico | ídem | OK |
| extremos | `serie[-1].periodo == periodo_actual == hasta`; `desde == serie[0].periodo` | ídem | OK |
| `parcial` | `[False]×5 + [True]` | ídem | OK |
| meses sin snapshot | **no se omiten**: `sin_dato: true` y los 10 campos de métrica en `null`, `top_proveedores: []` | ídem | OK |
| claves del punto | siempre las 14 del contrato, con o sin dato | ídem | OK |
| `contratos_activos` / `ocupadas` / `canon_total` | **no aparecen** como clave de ningún punto (acme, beta, consolidado, 6 meses); `contratos_activos` sólo dentro de `top_proveedores`, que ya pasó por K=3 | ídem | OK |

Tests: `test_forma_seis_meses_ordenados_y_el_ultimo_parcial`,
`test_meses_sin_snapshot_van_con_sin_dato_y_nulls`,
`test_contratos_activos_y_ocupadas_nunca_salen_al_json`.

---

## Bugs

### BUG-1 — BLOQUEANTE: el consolidado de un mes pasado contradice a sus propios sumandos

`plataforma_tendencia.persistir_snapshots` congela un mes pasado **fila por
fila**: para cada slug, si la fila existe la deja intacta; si no existe, la
**inserta**. El consolidado es una fila más con el mismo trato. Resultado: un mes
pasado puede quedar con filas por cliente que **no suman** lo que dice su fila
`__consolidado__` de al lado.

**Cómo se llega (sin nada raro, y pasa en el arranque de la app):**

1. El servidor arranca → `_run_lease_maintenance` → `cerrar_mes_anterior()`
   cierra M-1 con los clientes que existen / se dejan leer **en ese instante**, y
   escribe la fila `__consolidado__` de M-1.
2. Después aparece un cliente que en (1) no estaba: alta ese mismo día con
   contratos que arrancan en M-1, o —el caso feo— **su base estaba ilegible
   durante el cierre** y por eso no recibió fila.
3. Alguien abre `/metricas?periodo=M-1`. El write-through **inserta** la fila de
   ese cliente (no existía) pero **no toca** la consolidada (existía + mes pasado
   ⇒ congelada).
4. La serie consolidada de M-1 queda mostrando el total de antes del paso 2, para
   siempre, con `clientes_con_error: 1` al lado de un cliente que **sí** tiene su
   fila de ese mes.

**Reproducción medida** (volcado directo de `snapshot_metricas`, escenario K=3,
M-1 = `2026-08`):

```
2026-08 __consolidado__  origen=cierre  contr=0  canon=0.0     caras=0  ocup=0  incl=1
2026-08 acme             origen=vista   contr=3  canon=1200.0  caras=5  ocup=3  incl=1
2026-08 beta             origen=vista   contr=0  canon=0.0     caras=2  ocup=0  incl=1
```

| punto | esperado | obtenido |
|---|---|---|
| consolidado M-1 `ingreso_contratado_mes` | **1.200,00** | `null` |
| consolidado M-1 `canon_promedio_mensual` | **400,00** | `null` |
| consolidado M-1 `ocupacion_pct` | **60.0 %** (3/5) | `null` |
| consolidado M-1 `clientes_incluidos` | **2** | 1 |

Los `null` vienen de aplicar K=3 sobre **0** contratos: el número está mal **por
defecto** — subestima el ingreso y la ocupación del negocio, que es exactamente
la lectura que la fase existe para dar. Y el gráfico de línea dibuja el mes como
un hueco o un pozo.

Test que lo fija: `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`,
marcado `xfail(strict=True)` para no dejar la suite en rojo — cuando el builder
lo arregle, da **XPASS** y hay que borrar la marca.

**Arreglo sugerido (del lado del builder):** tratar el mes como una unidad. Si al
persistir un mes pasado se **insertó** alguna fila por cliente, recalcular y
actualizar la fila `__consolidado__` de ese mes a partir de las filas por cliente
presentes. La regla de congelado sigue valiendo para lo ya escrito; lo que no
puede pasar es que el total contradiga a sus sumandos.

### BUG-2 — MENOR: el cierre reintenta indefinidamente si hay un cliente roto

`cerrar_mes_anterior` corta sólo si `esperados <= presentes`, o sea si **todos**
los slugs del registro tienen fila en M-1. Un cliente con la base rota nunca
recibe fila (correcto: no se le inventan ceros), así que la condición no se
cumple **nunca** mientras siga rota — y cada corrida del mantenimiento (cada
12 h) vuelve a recorrer las N bases de todos los clientes para no escribir nada
nuevo. No corrompe datos (el congelado protege lo escrito), pero es un recorrido
completo, indefinido, disparado por un cliente que ya se sabe que falla. Y
combinado con BUG-1, es el camino más probable para llegar a un consolidado
congelado inconsistente.

Test que lo documenta: `test_HALLAZGO_cierre_reintenta_para_siempre_con_un_cliente_roto`
(pasa; afirma la condición del backend, así que avisa si la guarda cambia).

**Arreglo sugerido:** marcar el mes como cerrado por otra vía (p. ej. considerarlo
completo cuando está la fila `__consolidado__` con `clientes_incluidos +
clientes_con_error == len(esperados)`), o guardar el intento fallido para no
repetirlo dentro del mismo ciclo.

### BUG-3 — MEDIA (flake de la suite): el cierre retrasa el pase de recordatorios y `test_recordatorios.py` se volvió intermitente

En la corrida completa de la suite falla **un** test de `tests/test_recordatorios.py`,
y **falla uno distinto en cada corrida** (`test_la_marca_lleva_el_hito_y_no_los_dias`,
`test_no_se_repite_aunque_el_hito_cubra_varios_dias`,
`test_un_contrato_que_aparece_tarde_recibe_UNO_solo`). El síntoma es siempre el
mismo: **un correo de recordatorio de más**.

```
assert rem.check_expiring_leases(db) == 1
assert rem.check_expiring_leases(db) == 0
assert len(correos) == 1
E  AssertionError: assert 2 == 1
E   +  where 2 = len([(['comercial@galerias.co'], 'Contrato vence en 25 días — NAVE-TEST-02'),
E                     (['comercial@galerias.co'], 'Contrato vence en 25 días — NAVE-TEST-02')])
```

`tests/test_recordatorios.py` **no está modificado** (`git status` lo confirma) y
corriendo el archivo solo pasa unas veces y falla otras — es un flake, no una
rotura determinista.

**Mecanismo (hipótesis fundada, no probada).** `_lease_maintenance_loop` corre
`_run_lease_maintenance` **al arrancar**, en un hilo, en paralelo con el cuerpo del
test. La Fase 5 metió `cerrar_mes_anterior()` **al principio** de esa función
(`app/main.py`), y ese cierre recorre TODAS las bases de cliente vía
`plataforma_metricas.calcular`. O sea: el pase de recordatorios ahora arranca
bastante más tarde que antes, y en vez de terminar antes de que el test empiece,
cae **en medio** del test y manda el segundo correo. La carrera ya existía; la
Fase 5 le corrió el reloj hasta hacerla visible.

No lo puedo probar sin revertir la Fase 5 y hacer A/B, y `app/**` no es mi
territorio. Lo dejo para el builder / el Maestro porque **es lo único que mantiene
la suite en rojo**.

**Arreglos posibles (del lado del builder):** mover `cerrar_mes_anterior()`
DESPUÉS del recorrido de clientes (es una tarea de plataforma, no urgente), o
—mejor— que el `lifespan` no arranque el ciclo de mantenimiento cuando
`ENV == "test"`, que es lo que la carrera pide a gritos desde antes de esta fase.

### Observación (no es bug): el cierre corre en el arranque

El `lifespan` arranca el ciclo de mantenimiento, así que `cerrar_mes_anterior()`
se ejecuta **apenas se abre el `TestClient`**, antes de que un test funde sus
clientes. Es el comportamiento real y deseado. Los escenarios de esta auditoría
llaman a `_purgar_snapshots()` después de sembrar para no mezclar su siembra con
ese cierre de arranque; los tests de cierre lo purgan y lo disparan a mano.

---

## Salida de pytest

```
$ cd backend && mkdir -p /tmp/pt-contador && TMPDIR=/tmp/pt-contador \
    python -m pytest tests/test_tendencia_conciliacion.py -p no:warnings -rx

.....................x.                                                  [100%]
=========================== short test summary info ============================
XFAIL tests/test_tendencia_conciliacion.py::test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues
  - BUG-1: el consolidado de un mes pasado queda congelado sin los clientes cuya
    fila se insertó DESPUÉS del cierre; el total contradice a sus sumandos
22 passed, 1 xfailed in 46.40s

EXIT=0
```

```
$ cd backend && TMPDIR=/tmp/pt-contador python -m pytest -q -p no:warnings

# Corrida 1 (árbol en movimiento: otros agentes editaban tests durante la corrida)
FAILED tests/test_metricas_ataques.py::test_m25_lo_unico_que_crece_en_el_registro_es_la_bitacora
FAILED tests/test_recordatorios.py::test_la_marca_lleva_el_hito_y_no_los_dias
EXIT=1
  → los dos vuelven a pasar corriendo sus archivos solos; el primero fue el
    builder renombrando ese test en pleno vuelo.

# Corrida 2 (árbol quieto)
FAILED tests/test_recordatorios.py::test_no_se_repite_aunque_el_hito_cubra_varios_dias
EXIT=1

# Corriendo tests/test_recordatorios.py solo, dos veces seguidas
......................                                                   [100%]   (22 passed)
FAILED tests/test_recordatorios.py::test_un_contrato_que_aparece_tarde_recibe_UNO_solo

  → FLAKE, no rotura: falla un test DISTINTO cada vez. Ver BUG-3.

**Exit code real de la suite entera: 1**, por el flake de `test_recordatorios.py`.
Ningún test de `test_tendencia_conciliacion.py` falla en ninguna corrida, y ningún
test de Fases 1-4 falla de forma reproducible.
```

---

## GAPS — qué no pude verificar y por qué

1. **Meses realmente pasados.** Todo se prueba con la base de hoy y contratos
   fechados hacia atrás. No hay forma, desde un test, de que "la verdad de
   agosto" sea distinta de la de hoy: la premisa entera de la fase (recalcular un
   mes viejo da los contratos de HOY) no es verificable acá, sólo se verifica su
   consecuencia observable (el congelado).
2. **Concurrencia del upsert.** El `UNIQUE(cliente_slug, periodo)` se probó por
   repetición secuencial (4 pedidos → 1 fila), no con dos requests simultáneos
   contra la misma fila del mes en curso. Con SQLite en tests no es concluyente;
   habría que mirarlo contra Postgres.
3. **Cruce de año.** `periodo_anterior` cruza diciembre→enero según su código y
   `ultimos_periodos` se usó tal cual para la forma, pero como los períodos son
   relativos a *hoy* (2026-09), esta corrida no atravesó un cambio de año. Se
   cubrirá sola en enero; un test con `freeze` del reloj sería mejor.
4. **`meses` en los bordes (1, 24, 0, 25) y el 404/422.** Es la puerta del
   endpoint, no la aritmética; queda para el agente de seguridad/ataques.
   Acá sólo se usaron `meses=1|3|6` como vehículo de los números.
5. **`sedes_con_plano` del consolidado.** Se verificó como suma en el cierre pero
   no se auditó con clientes de distinta cantidad de sedes en el mismo mes.
6. **Frontend.** El gráfico de línea, el estado vacío con <2 meses y la marca de
   parcial no son territorio de esta auditoría: acá sólo se afirma que el JSON
   trae `parcial` y `sin_dato` bien puestos.
7. **Causalidad de BUG-3.** Que el flake de `test_recordatorios.py` lo destape el
   `cerrar_mes_anterior()` del arranque es una hipótesis con mecanismo claro, no
   una medición: probarlo pide revertir la Fase 5 y hacer A/B sobre `app/main.py`,
   que no es mi territorio.
8. **Árbol en movimiento.** Las corridas de la suite completa se hicieron mientras
   otros agentes editaban `tests/` y corrían pytest en paralelo sobre el mismo
   working tree; la corrida 1 salió contaminada por eso. La corrida 2 y las
   corridas por archivo son las que valen.
9. **`ultimo_acceso`.** No forma parte del contrato de la serie (sí del de
   `/metricas`); no se auditó.
