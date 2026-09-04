# ENTREGA — Fase 5: Tendencia temporal (histórico de métricas)

Rama: `claude/fase-5-tendencia` (sobre `main` = `eb6f9d4`, PR #42 mergeado).
Equipo: backend-tendencia (opus, builder) · frontend-tendencia (sonnet, builder) ·
contador-tendencia (opus, auditor) · frontera-tendencia (sonnet, auditor).
Rondas de coherencia: 1 (sin conflictos). Verificación independiente: sonda propia
por HTTP + experimentos controlados sobre la suite.

**Veredicto corto: la funcionalidad está completa y correcta en todo lo medido,
pero NO se puede mergear tal cual.** Hay una regresión de arranque que hace
intermitente la suite (y que en producción alarga cada arranque), un bug
documentado como `xfail` que deja al consolidado contradiciendo a sus sumandos,
y nada del trabajo está commiteado todavía.

---

## 1. Qué se construyó

La Fase 4 dejó la foto; ésta agrega la película. Un mes pasado no se puede
recorrer (la base guarda los contratos como están HOY), así que se persiste mes
a mes lo que la consola calcula.

### Backend

- **`snapshot_metricas`** (tabla nueva del registro, `create_all()`, sin
  migración, sin columnas nuevas en tablas existentes). `UNIQUE(cliente_slug,
  periodo)`. Una fila por cliente y mes, más la del total con
  `cliente_slug = "__consolidado__"` (fuera de `SLUG_VALIDO`, no colisiona).
  Guarda **crudos**: `sedes_con_plano`, `espacios_comercializables`, `ocupadas`,
  `contratos_activos`, `canon_total`, `usuarios` (conteo, ningún id ni correo),
  `proveedores_json` (top 5, nombre original), `clientes_incluidos`,
  `clientes_con_error`, `origen` (`vista` | `cierre`), `capturado_en`.
  `backend/app/models/plataforma.py:111`.
- **`backend/app/plataforma_tendencia.py`** (464 líneas, nuevo): `persistir_snapshots`,
  `cerrar_mes_anterior`, `publicar_fila`, `serie`. Reusa `_pct`, `_plata`,
  `_top` y `_suprimir_celda_chica` de `plataforma_metricas` — cero fórmulas
  duplicadas. **K=3 y saneo se aplican al leer**, no al guardar.
  `contratos_activos` y `ocupadas` nunca salen al JSON.
- **Poblado híbrido, sin job nuevo**:
  - *Write-through*: `calcular()` hace el upsert antes del `return`
    (`plataforma_metricas.py:565-573`). Colgado del cálculo, no del endpoint,
    porque un acierto del cache de 5 min no recalcula nada.
  - *Cierre automático*: `cerrar_mes_anterior()` al principio de
    `_run_lease_maintenance` (`main.py:122-134`); si al mes cerrado le falta la
    fila consolidada o la de algún cliente, llama a `calcular(mes, origen="cierre")`.
  - *Regla del congelado*: el mes en curso se sobreescribe siempre; un mes
    pasado se inserta sólo si falta. Un cliente con base rota no recibe fila.
- **`GET /api/plataforma/tendencia?cliente=<slug|__consolidado__>&meses=N`**
  (`routers/plataforma.py:110-152`). `require_operador`, ruta literal antes de
  `/clientes/{slug}`. No abre bases de cliente. Siempre N meses consecutivos
  terminando en el mes en curso; mes sin fila → `sin_dato: true`; mes en curso
  → `parcial: true`. `meses` fuera de 1..24 → 422; slug inexistente → 404 con
  texto fijo. Bitácora `accion="tendencia"`, `periodo="<cliente>:<desde>..<hasta>"`.
- **Consolidado ponderado (Σ/Σ)**: la fila guarda sumas; canon promedio y
  ocupación se derivan al leer (`plataforma_metricas.py:590 consolidar_agregado`).
- Tests nuevos: `test_plataforma_tendencia.py` (804), `test_tendencia_ataques.py`
  (869), `test_tendencia_conciliacion.py` (1023). Modificado
  `test_metricas_ataques.py::test_m25` — ahora acepta que `snapshot_metricas`
  crezca al consultar métricas (aflojamiento consciente de un guardrail de Fase 4,
  justificado en el propio test).

### Frontend

- `frontend/src/components/plataforma/tendencia.tsx` (527, nuevo): panel
  "Tendencia" con selectores (cliente / meses), **dos gráficos apilados** (nunca
  doble eje): Ocupación (%) con eje 0–100 y Ingreso contratado (mes). SVG propio,
  sin librería. Lectura accionable al lado del título ("vs mes anterior: +3,6 pts
  · subió 2 meses seguidos"). Mes en curso con tramo punteado y punto hueco,
  rotulado "parcial". Mes sin snapshot: tick corto + "· sin dato", la línea NO
  interpola. Mes suprimido por K=3: cuadradito rayado + "· suprimido por
  privacidad (K=3)", línea cortada a ambos lados. `<details>` "Ver valores por
  mes" con tabla accesible. Estado vacío honesto con menos de 2 meses con dato.
- Tokens `--con-linea` / `--con-linea-punto` en `index.css` (claro :281-287,
  oscuro :321-325). Cliente API en `api/plataforma.ts`; montado en `pages/Plataforma.tsx`.

---

## 2. Coherencia

Ronda 1: `{"coherente": true, "conflicts": []}`. Builders y auditores
coincidieron en: crudos vs públicos, supresión al leer, Σ/Σ para el consolidado,
huecos explícitos en la serie, endpoint operator-only y bitácora por rango. No
hubo segunda ronda.

---

## 3. Verificación (sonda propia)

Semilla: 3 clientes legibles (`acme`, `beta`, `galerias` vacío) + 1 cliente con
base rota, 3 meses (2026-07/08/09). `tsc --noEmit` exit 0; `npm run build` exit 0
(2.158 kB).

| Ítem | Estado |
|---|---|
| Serie de 3 meses correcta, consolidado ponderado | Cumplido |
| Mes en curso `parcial`; con 1 mes, estado vacío honesto | Cumplido |
| K=3 y saneo por mes en la serie | Cumplido |
| Write-through al abrir métricas | Cumplido |
| Cierre automático sin abrir la consola | Cumplido |
| Endpoint operator-only + bitácora | Cumplido (403 legado sólo por test, no reproducido en sonda) |
| Gráfico claro/oscuro, capturas revisadas | Cumplido |
| Suite verde DOS veces + tsc/build limpios | **PENDIENTE — suite intermitente (ver §4)** |

### Cifras

Snapshots tras 3 llamadas a `calcular` (12 filas = 3 clientes + consolidado × 3 meses):

```
2026-07  acme caras=6 ocup=3 contr=3 canon=3.000.000 · beta 4/3/3/1.500.000 · galerias 0
         __consolidado__ caras=10 ocup=6 contr=6 canon=4.500.000 incl=3 err=0
2026-08  acme 6/4/4/4.000.000 · beta 4/2/2/1.000.000 · __consolidado__ 10/6/6/5.000.000
2026-09  acme 6/4/4/8.000.000 · beta 4/3/3/1.500.000 · __consolidado__ 10/7/7/9.500.000
```

`GET /api/plataforma/tendencia?cliente=__consolidado__&meses=3`:

```
2026-07  ocupación 60,0 %  canon 750.000,00     ingreso 4.500.000,00  parcial=false
2026-08  ocupación 60,0 %  canon 833.333,33     ingreso 5.000.000,00  parcial=false
2026-09  ocupación 70,0 %  canon 1.357.142,86   ingreso 9.500.000,00  parcial=TRUE
```

Ponderado vs promedio-de-promedios: 833.333,33 vs 750.000 (ago) y 1.357.142,86
vs 1.250.000 (sep) → el endpoint usa Σ/Σ, el correcto. Verificado a mano contra
las filas por cliente (2026-08: Σcontratos=6, Σcanon=5.000.000).

Serie de `beta`: 07 y 09 con ingreso 1.500.000 y top de 3 proveedores; **08 (2
contratos) con `canon_promedio_mensual=null`, `ingreso_contratado_mes=null`,
`top_proveedores=[]` y ocupación 50,0 % visible**. K=3 aplicado por mes, no
congelado. `contratos_activos` y `ocupadas` nunca aparecen en el JSON.

Congelado: recalcular un mes pasado con el canon cambiado de 111,0 a 999.999,0
dejó la fila en 111,0; el mes en curso sí convergió (0,0 → 5.000,0).

Cierre: borradas las filas del mes anterior, `cerrar_mes_anterior()` las repuso
con `origen='cierre'` para `galerias`, `zeta` y `__consolidado__`.

Frontera por HTTP: operador 200 · dueño de cliente (OAuth real) 403 "Solo para
operadores de la plataforma." · sin token 401 · slug inexistente 404 texto fijo
· `meses=99` 422. Bitácora: 2 líneas `accion='tendencia'`,
`periodo='__consolidado__:2026-07..2026-09'` y `'beta:2026-07..2026-09'`.

Capturas en `features/tendencia/outputs/capturas/`: `tendencia-v1.png`
(consolidado 6 meses, claro), `tend-mf-claro.png` / `tend-mf-oscuro.png`
(MercaFresco con jun-26 suprimido por K=3), `tend-vacio.png` (1 solo snapshot →
estado vacío, sin línea de un punto), más `tendencia-claro/oscuro.png` del
builder. Cero errores de consola salvo `ERR_CONNECTION_RESET` del favicon.

---

## 4. Conflictos abiertos (bloqueantes primero)

### B-1 — Regresión: la suite es intermitente por `cerrar_mes_anterior()` en el arranque

- Corrida 1 de la suite: exit 0 (100 %, 8 xfail). Corrida 2: exit 1,
  `FAILED tests/test_recordatorios.py::test_un_contrato_que_aparece_tarde_recibe_UNO_solo`
  (`check_expiring_leases(db) == 1` devolvió 0).
- Aislado con experimento controlado (copia limpia en `/tmp/verif-f5`, porque
  otra sesión corría pytest en el árbol compartido):
  - fase-5, `test_recordatorios.py` solo, 13 corridas: **4 fallos**, cada vez un
    test distinto del archivo. Carrera clásica.
  - `main` (eb6f9d4), mismo archivo, 16 corridas: 0 fallos.
  - fase-5 con UNA línea desactivada (`cerrar_mes_anterior()` en `main.py:131-134`),
    10 corridas: **0 fallos**.
- Mecanismo: el lifespan arranca `_run_lease_maintenance` en un hilo en cada
  test que usa el fixture `client` (`main.py:154-157`). Con `cerrar_mes_anterior()`
  al principio, cuando al mes cerrado le falta una fila llama a `calcular()`,
  que recorre todas las bases. El barrido de `check_expiring_leases` que viene
  después ahora cae dentro del cuerpo del test: el hilo manda el aviso y marca
  el hito antes de que el test lo pida.
- **No es sólo un problema de tests**: en producción cada arranque (Render free
  tier reinicia seguido) hace ahora un barrido completo de métricas sobre todas
  las bases ANTES de procesar vencimientos y recordatorios.
- Opciones: (a) mover `cerrar_mes_anterior()` al FINAL del ciclo, después del
  recorrido por clientes (pierde la garantía "se cierra aunque la vuelta se
  corte", que era el motivo de ponerlo primero); (b) ejecutarlo en su propia
  tarea asíncrona separada del ciclo de vencimientos; (c) hacer que el fixture
  `client` de tests no arranque el lifespan de mantenimiento, o que espere a que
  la primera vuelta termine. Recomiendo (b) + (c): el cierre mensual no tiene
  por qué compartir hilo con los recordatorios, y los tests no deberían depender
  del orden de un hilo de fondo.

### B-2 — BUG-1: el consolidado congelado no incluye al cliente que llegó después

- Documentado por el conciliador como `xfail(strict=True)` en
  `tests/test_tendencia_conciliacion.py:929`. **La suite pasa PORQUE el bug sigue ahí.**
- Reproducido sin sus helpers: `cerrar_mes_anterior()` con sólo `galerias`
  (vacío) → consolidado del mes pasado = 0 contratos, $0. Aparece `acme` con 3
  contratos y $1.200 en ese mes; alguien abre `/metricas` de ese mes → `acme`
  recibe su fila. Serie de `acme`: ingreso $1.200,00 / ocupación 60,0 %. Serie
  del consolidado del MISMO mes: ingreso `null`, ocupación `null`,
  `clientes_incluidos` 1. **El total contradice a sus sumandos, para siempre.**
- Lo mismo lo dispara un cliente con base rota durante el cierre que se arregla
  después. `docs/ESTADO.md:355-361` lo describe sólo como "el primer mes de vida
  de un cliente"; queda más suave de lo que es.
- Opciones: recomputar la fila consolidada como Σ de las filas por cliente
  presentes cada vez que se inserta una fila por cliente de un mes pasado (la
  fila consolidada dejaría de ser "congelada" y pasaría a ser "derivada de las
  congeladas"); o aceptar el hueco y marcar el consolidado como `incompleto`
  cuando `clientes_incluidos` < filas por cliente del mes.

### M-1 — BUG-2 (menor): cliente con base rota → cierre "incompleto" para siempre

`esperados <= presentes` nunca se cumple, y cada corrida del ciclo de 12 h
vuelve a recorrer todas las bases. Idempotente y barato hoy. Documentado en
`test_tendencia_conciliacion.py:995` y `docs/ESTADO.md:349-354`. Se agrava con B-1.

### M-2 — 403 del token legado no reproducido en sonda

El login clásico devolvió 401/422 por el armado del entorno; queda cubierto sólo
por `tests/test_tendencia_ataques.py:322`.

### M-3 — Diseño (no bloqueante): el gráfico ocupa ~40 % del ancho del panel

`width:100%` + `preserveAspectRatio xMinYMid` deja medio panel en blanco a la
derecha. Con 12 meses por defecto y poca historia, 7 ticks de "sin dato" antes
de que arranque la línea. Cambiar a `xMidYMid` o un viewBox que siga el ancho.

### M-4 — Guardrail aflojado

`test_metricas_ataques.py::test_m25` ahora tolera que `snapshot_metricas` crezca
al consultar métricas. Es consecuencia directa del write-through y está
justificado en el test, pero conviene que el humano lo vea a conciencia.

---

## 5. Texto para `docs/ESTADO.md`

La sección "Fase 5 — Tendencia temporal" ya está escrita en el árbol de trabajo
(`docs/ESTADO.md:291-364`) y describe tabla, supresión al leer, poblado híbrido,
endpoint, Σ/Σ y bitácora tal como quedaron. **Dos ajustes antes de mergear**, en
"Pendientes conocidos de la fase":

Reemplazar el punto "El primer mes de vida de un cliente puede quedar con el
consolidado incompleto" por:

> - **El consolidado congelado no se repara cuando después aparece una fila por
>   cliente del mismo mes** (`test_tendencia_conciliacion.py:929`, xfail strict).
>   Si el ciclo cierra el mes anterior sin un cliente (porque todavía no existía
>   o porque su base falló en ese momento) y ese cliente recibe su fila después
>   por write-through, la fila consolidada queda con menos sumandos que las filas
>   por cliente y la serie del total contradice a la serie de sus partes, para
>   siempre. En producción el orden natural reduce el caso a clientes nuevos y a
>   bases rotas durante el cierre; en las pruebas se limpia la tabla al armar el
>   escenario (`_limpiar_snapshots()`).

Agregar, según cómo se resuelva B-1:

> - **`cerrar_mes_anterior()` corre en [su propia tarea | el final del ciclo]**
>   y no al principio de `_run_lease_maintenance`: cuando le falta una fila llama
>   a `calcular()` sobre todas las bases, y hacerlo antes de vencimientos y
>   recordatorios retrasaba ese barrido varios segundos en cada arranque (y
>   hacía intermitentes los tests de recordatorios, que compartían hilo).

Y en "Verificación mínima" / reglas duras, si se adopta (c): el fixture `client`
no arranca el mantenimiento de fondo (o espera su primera vuelta).

---

## 6. Qué le queda al humano

1. **Decidir y aplicar el arreglo de B-1** (dónde vive `cerrar_mes_anterior()`)
   y correr la suite dos veces seguidas en un árbol limpio, sin otra sesión
   corriendo pytest en paralelo. Hasta entonces, no mergear.
2. **Decidir B-2**: consolidado derivado de las filas por cliente, o hueco
   marcado como incompleto. Si se arregla, quitar el `xfail` de
   `test_tendencia_conciliacion.py:929` y ajustar `docs/ESTADO.md`.
3. **Commitear**: nada del trabajo está versionado. La rama tiene un solo commit
   propio (`42ffc5d`, la spec). Archivos: 9 modificados + 5 nuevos (lista en
   `git status`); `features/tendencia/outputs/` decidir si va al repo.
4. Revisar a conciencia el aflojamiento de `test_m25` (M-4).
5. Opcional: M-3 (ancho del gráfico) y verificar a mano el 403 del token legado
   contra el deploy (M-2).
6. Cargar en Engram (desde la máquina local) los gotchas de esta fase: el hilo de
   mantenimiento comparte tiempo con los tests, y "congelado" no es lo mismo que
   "consistente" para una fila derivada.
