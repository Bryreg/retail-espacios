# Fase 5 — Backend: snapshot mensual, cierre y `GET /api/plataforma/tendencia`

Builder de backend. Rama `claude/fase-5-tendencia`, **sin commit ni push**.

---

## 1. Archivos tocados

| Ruta absoluta | Qué |
|---|---|
| `/tmp/retail-espacios-test/backend/app/models/plataforma.py` | **Modificado**: clase nueva `SnapshotMetricas` + reexport de `CONSOLIDADO_SLUG`. Cero columnas agregadas a tablas existentes. |
| `/tmp/retail-espacios-test/backend/app/plataforma_tendencia.py` | **NUEVO**: el módulo entero de la fase (persistencia, cierre, publicación y serie). |
| `/tmp/retail-espacios-test/backend/app/plataforma_metricas.py` | **Modificado, mínimo**: firma `calcular(anio_mes, origen="vista")`, el dict `crudos_por_slug` en el bucle y la llamada de write-through antes del `return`. Ni una fórmula ni una clave del JSON cambiaron. |
| `/tmp/retail-espacios-test/backend/app/routers/plataforma.py` | **Modificado**: ruta `GET /tendencia` declarada justo después de `/metricas`, + el import de los defaults. |
| `/tmp/retail-espacios-test/backend/app/main.py` | **Modificado**: `cerrar_mes_anterior()` al principio de `_run_lease_maintenance()`, envuelto en `try/except`. |
| `/tmp/retail-espacios-test/backend/tests/test_plataforma_tendencia.py` | **NUEVO**: 22 pruebas. |
| `/tmp/retail-espacios-test/docs/ESTADO.md` | **Modificado**: sección "Fase 5 — Tendencia temporal (histórico de métricas)" con tabla, poblado híbrido, endpoint, bitácora y pendientes. |

Sin migraciones. Sin tocar `frontend/**` ni ningún test existente.

---

## 2. Contrato D — el JSON, tal como quedó

Copiado **literal** de una respuesta real capturada desde una prueba
(`GET /api/plataforma/tendencia?cliente=__consolidado__&meses=4`, operador
autenticado). Se ven las cuatro cosas que importan: los meses sin dato
presentes y en `null`, el mes en curso marcado `parcial`, el consolidado
ponderado y el nombre de proveedor **saneado**.

```json
{
  "cliente": "__consolidado__",
  "nombre": "Consolidado",
  "meses": 4,
  "desde": "2026-06",
  "hasta": "2026-09",
  "periodo_actual": "2026-09",
  "generado_en": "2026-09-04T20:05:06Z",
  "serie": [
    {
      "periodo": "2026-06",
      "parcial": false,
      "sin_dato": true,
      "capturado_en": null,
      "origen": null,
      "clientes_incluidos": null,
      "clientes_con_error": null,
      "sedes_con_plano": null,
      "espacios_comercializables": null,
      "ocupacion_pct": null,
      "canon_promedio_mensual": null,
      "ingreso_contratado_mes": null,
      "top_proveedores": [],
      "usuarios_con_cuenta": null
    },
    {
      "periodo": "2026-07",
      "parcial": false,
      "sin_dato": true,
      "capturado_en": null,
      "origen": null,
      "clientes_incluidos": null,
      "clientes_con_error": null,
      "sedes_con_plano": null,
      "espacios_comercializables": null,
      "ocupacion_pct": null,
      "canon_promedio_mensual": null,
      "ingreso_contratado_mes": null,
      "top_proveedores": [],
      "usuarios_con_cuenta": null
    },
    {
      "periodo": "2026-08",
      "parcial": false,
      "sin_dato": false,
      "capturado_en": "2026-09-04T20:05:06Z",
      "origen": "cierre",
      "clientes_incluidos": 3,
      "clientes_con_error": 0,
      "sedes_con_plano": 1,
      "espacios_comercializables": 9,
      "ocupacion_pct": 44.4,
      "canon_promedio_mensual": 683333.33,
      "ingreso_contratado_mes": 4100000.0,
      "top_proveedores": [
        { "nombre": "Alpina", "contratos_activos": 3 },
        { "nombre": "Nutresa", "contratos_activos": 2 }
      ],
      "usuarios_con_cuenta": 2
    },
    {
      "periodo": "2026-09",
      "parcial": true,
      "sin_dato": false,
      "capturado_en": "2026-09-04T20:05:06Z",
      "origen": "vista",
      "clientes_incluidos": 3,
      "clientes_con_error": 1,
      "sedes_con_plano": 3,
      "espacios_comercializables": 9,
      "ocupacion_pct": 55.6,
      "canon_promedio_mensual": 750000.0,
      "ingreso_contratado_mes": 4500000.0,
      "top_proveedores": [
        { "nombre": "Alpina", "contratos_activos": 3 },
        { "nombre": "Bimbo Distribuciones ([correo oculto])", "contratos_activos": 2 },
        { "nombre": "Nutresa", "contratos_activos": 1 }
      ],
      "usuarios_con_cuenta": 2
    }
  ]
}
```

**Verificado contra el frontend**: las interfaces `PuntoTendencia` y `Tendencia`
de `/tmp/retail-espacios-test/frontend/src/api/plataforma.ts` coinciden clave por
clave con esta respuesta, incluido `CONSOLIDADO_SLUG = "__consolidado__"`.

Códigos de error: `meses` fuera de 1..24 → **422**; `cliente` inexistente →
**404** con `detail` exacto `"No hay un cliente con ese código."`; no operador
(u owner de un cliente) → **403**.

---

## 3. Decisiones tomadas

1. **La tabla guarda CRUDOS; K=3 y el saneo se aplican al leer.**
   `publicar_fila()` importa `_pct`, `_plata`, `_top` y `_suprimir_celda_chica`
   de `plataforma_metricas` — **no hay una sola fórmula reescrita**. Consecuencia
   observable y probada: dos meses de la *misma* serie salen uno suprimido y el
   otro publicado según los contratos de cada mes, y si mañana el umbral sube a
   5 el histórico entero obedece sin tocar una fila guardada.

2. **`usuarios` es un CONTEO, no una lista de ids.** El cálculo en vivo necesita
   los ids para deduplicar a la misma persona con cuenta en dos supermercados;
   esa deduplicación se resuelve **en memoria al capturar** (`len(unión)`) y a
   disco baja sólo el número. Un histórico es justamente lo que no conviene que
   acumule identificadores. Hay una prueba que lo fija.

3. **`contratos_activos` y `ocupadas` nunca salen al JSON**, aunque estén en la
   tabla: son el numerador y el denominador de la propia supresión. Publicarlos
   junto a importes en `null` diría "acá hay 2 contratos", que es la mitad de lo
   que K=3 esconde. Salen sólo transformados (`ocupacion_pct`) o como el conteo
   por proveedor del top, que ya pasó por la supresión.

4. **La fila consolidada se guarda calculada, no se suma al vuelo al leer.** La
   lista de clientes de hace seis meses no es la de hoy: sumar al leer haría que
   un cliente dado de baja desapareciera también de su propio pasado. Guarda
   **SUMAS**, nunca promedios, y el ponderado (Σ/Σ) se deriva al publicar —
   guardar el promedio ya calculado dejaría sin sumandos y la única cuenta
   posible pasaría a ser el promedio de promedios, la equivocada.

5. **Top de proveedores: se fusionan los diccionarios COMPLETOS y recién ahí se
   recorta a 5.** Recortar antes de sumar dejaría afuera al proveedor que es
   sexto en cada cliente y primero en el total. Por cliente se persiste ya
   recortado a 5, que es todo lo que el JSON público puede mostrar: guardar la
   cola sería acumular para siempre nombres de terceros que nadie va a ver.

6. **Regla del congelado.** Mes en curso → se sobreescribe siempre (converge, y
   la última escritura antes del cambio de mes es la definitiva). Mes pasado →
   se inserta sólo si falta, porque recalcularlo hoy daría los contratos de hoy.
   Idempotente por `UNIQUE(cliente_slug, periodo)`; una prueba verifica que ni
   el `capturado_en` de un mes pasado se mueve.

7. **Un cliente con la base rota NO recibe fila.** Un hueco es la verdad ("no se
   sabe"); un cero sería una mentira congelada para siempre en el gráfico. La
   fila consolidada sí registra `clientes_con_error` para que el hueco sea
   legible.

8. **El write-through cuelga del CÁLCULO, no del endpoint.** Un acierto del caché
   de 5 minutos no recalcula nada y no tiene crudos que guardar. Y **nunca
   propaga**: si la persistencia falla, `/metricas` responde igual — la foto del
   panel no puede depender de que la historia se haya podido guardar.

9. **El cierre va ANTES del bucle de clientes** en `_run_lease_maintenance`: es
   tarea de la plataforma y no de cada supermercado, se hace una sola vez por
   corrida, y así el mes queda cerrado aunque la vuelta por los clientes se corte
   a la mitad por `_stop_mantenimiento`.

10. **El endpoint no tiene caché**, a propósito: son N filas de una tabla
    indexada del registro (no hay N bases que recorrer, que es lo que el caché de
    métricas existe para evitar), y a cambio el operador ve en el acto el efecto
    de su propio refresco.

11. **La bitácora anota el ALCANCE, no un mes**: `periodo =
    "<cliente>:<desde>..<hasta>"`. Lo consultado acá es un rango; sin los
    extremos, saber que alguien miró la tendencia no dice qué tendencia miró.

12. **Import local en el hook.** `plataforma_tendencia` importa de
    `plataforma_metricas` a nivel de archivo (reusa las cuatro funciones de
    publicación), así que el `from app.plataforma_tendencia import
    persistir_snapshots` de `calcular()` va **adentro de la función** para no
    cerrar el ciclo.

### Nota sobre el estado del árbol al empezar

El working tree traía cambios previos **no comiteados** en
`app/models/plataforma.py` y `app/plataforma_metricas.py` con un diseño
divergente del contrato de esta misión (columnas `sedes`/`usuarios_json`, sin
`origen`, sin fila consolidada, `persistir_snapshots` de dos argumentos, y los
**ids de usuario persistidos**). Se revirtieron y se reescribió contra el
contrato literal, porque los auditores en paralelo escriben sus tests contra
esos nombres. Un escritor externo volvió a tocar `plataforma_metricas.py` a mitad
de la sesión (`19:43`); se lo dejó conformado al contrato — ver GAP 1.

---

## 4. Verificación

`cd /tmp/retail-espacios-test/backend && rm -f retail_espacios.db recabra_*.db && TMPDIR=/tmp/pt-backend python -m pytest -q`

`python -c "import app.main"` → **OK**.

| Corrida | Resultado | Exit |
|---|---|---|
| `tests/test_plataforma_tendencia.py` (nuevo) | **22 passed** | **0** |
| `tests/test_tendencia_conciliacion.py` (del auditor) + tendencia + `test_plataforma_metricas` + `test_metricas_conciliacion` | **124 passed, 1 xfail** | **0** |
| `tests/test_tendencia_ataques.py` (red team de la fase, del auditor) | **45 passed** | **0** |
| `tests/test_metricas_ataques.py` (red team Fase 4, con M-25 enmendado) | **36 passed** | **0** |
| Suite completa — corrida 1 | 2 fallos: `m25` (versión **vieja**, ver GAP 0) + 1 de `test_recordatorios` | 1 |
| Suite completa — corrida 2 | 2 fallos de `test_recordatorios` + 10 ERROR de `tempfile` | 1 |

**Ninguno de los fallos restantes es de esta fase**, y las dos corridas se
hicieron con **otros tres agentes corriendo la suite entera en paralelo** en la
misma máquina (verificado con `ps`), que es lo que explica el ruido:

- **`m25` en la corrida 1**: falló la versión **anterior** del test, que el
  auditor enmendó mientras esa corrida ya estaba en vuelo. En la corrida 2 —que
  colectó el archivo enmendado— **ya no aparece**, y `test_metricas_ataques.py`
  completo da **36 passed / exit 0**. Ver GAP 0.
- **`test_recordatorios.py`**: flaky **pre-existente**, con un test distinto en
  cada corrida. Verificado revirtiendo mi cambio de `main.py` con `git stash`:
  **2 de 3 corridas siguen fallando sin él**. Ver GAP 6.
- **Los 10 `ERROR ... RuntimeError: Directory ...`** (`test_estado_cuenta`,
  `test_files_acceso`, `test_bitacora`, `test_bulk_leases`) son colisión de
  directorio temporal entre los agentes concurrentes. **Los cuatro archivos
  juntos, aislados: 72 passed / exit 0.**

### Qué cubren las 22 pruebas nuevas

*Write-through*: las filas por cliente + la consolidada con crudos exactos contra
números sembrados a mano; idempotencia (repetir no duplica); el cliente roto sin
fila; mes en curso sobreescrito **y** mes pasado congelado (incluido el
`capturado_en`); `usuarios` sin ids; el JSON de `/metricas` idéntico con y sin
snapshot.
*Cierre*: `cerrar_mes_anterior()` puebla el mes anterior sin abrir la consola y
etiqueta `origen="cierre"`; es idempotente y no recaptura; `_run_lease_maintenance()`
lo invoca de verdad y sobrevive a un cliente `_romper()`.
*Endpoint*: N meses consecutivos siempre, `parcial` sólo en el mes en curso, el
hueco completo y en `null`, defaults (consolidado / 12), consolidado ponderado
Σ/Σ **distinto** del promedio de promedios, K=3 aplicado mes a mes en la misma
serie, saneo del nombre, `contratos_activos`/`ocupadas`/`canon_total` ausentes
del JSON, un mes congelado leído correctamente.
*Frontera*: 422 (0, 25, -3) y los extremos válidos 1 y 24; 404 con texto fijo y
sin URL de base; 403 sin token y para el owner de un cliente; bitácora con
`accion="tendencia"` y el alcance; y **ninguna base de cliente cambia de tamaño
ni de mtime** durante `/tendencia`.

---

## 5. GAPS abiertos

0. **RESUELTO por el auditor, se documenta porque cruzó fases — la regla dura
   M-25 tuvo que enmendarse.** `test_m25_lo_unico_que_crece_en_el_registro_es_la_bitacora`
   (`tests/test_metricas_ataques.py`) afirmaba que la ÚNICA tabla del registro
   cuyo conteo cambia durante un `GET /metricas` es `bitacora_plataforma`, y el
   write-through que esta fase **manda** hace crecer también `snapshot_metricas`.
   No había implementación que satisficiera las dos cosas: **M-25 codificaba una
   invariante de la Fase 4 que la Fase 5 enmienda a propósito**, igual que la
   Fase 4 enmendó la regla dura de la Fase 2.

   **Yo no toqué ese archivo** (la misión prohíbe modificar tests existentes para
   que pasen, y enmendar una regla dura no es decisión del builder). Lo dejé
   fallando y documentado; el auditor lo enmendó en paralelo, y además lo dejó
   MÁS fuerte de lo que yo hubiera propuesto:

   ```python
   assert set(crecieron) == {"bitacora_plataforma", "snapshot_metricas"}, crecieron
   assert crecieron["bitacora_plataforma"][1] - crecieron["bitacora_plataforma"][0] == 2
   assert crecieron["snapshot_metricas"][1] - crecieron["snapshot_metricas"][0] == 4
   ```

   Ese `== 4` fija tres conductas de esta fase de una sola vez: una fila por
   cliente **legible** (acme, beta, galerias) más la consolidada; **`roto` no deja
   fila**; y la segunda consulta, que sale del caché de 5 min, **no reescribe**
   (el write-through cuelga del cálculo, no del endpoint).
   `tests/test_metricas_ataques.py` completo: **36 passed, exit 0**. Y M-24 —que
   las bases de NEGOCIO no se muevan— pasa **sin cambios**.

1. **Escritor concurrente sobre `plataforma_metricas.py`** — otro proceso escribió
   ese archivo a mitad de la sesión y dejó una refactorización que no es de esta
   misión (`publicas_desde_crudos` / `consolidar_agregado`, que extraen las
   fórmulas ya existentes sin cambiar el JSON ni las cuentas). Se la respetó
   —es inocua y el contrato prohíbe *cambiar* fórmulas, no reubicarlas— y encima
   se aplicaron los dos cambios del contrato. **Conviene releer el diff final de
   ese archivo antes de mergear**: si el escritor vuelve a tocarlo, la firma
   `calcular(anio_mes, origen="vista")` y la llamada de cuatro argumentos a
   `persistir_snapshots` son lo que hay que preservar.
2. **Un cliente con la base rota deja el cierre "incompleto" para siempre**:
   `cerrar_mes_anterior()` compara contra `ClienteRow`, así que mientras a ese
   cliente le falte la fila del mes anterior, cada corrida del ciclo (12 h)
   recorre todas las bases de nuevo. Idempotente y barato en la escala actual,
   pero es trabajo repetido. La alternativa (anotar "este mes ya se intentó")
   pedía una tabla o una columna más, y el contrato es de cero columnas nuevas.
3. **El consolidado de un mes puede congelarse incompleto** si el ciclo cierra
   ese mes antes de que exista un cliente nuevo. En producción el orden natural
   es el contrario; en las pruebas se limpia la tabla al armar el escenario
   (helper `_limpiar_snapshots()`, documentado en el archivo). Si importara,
   habría que permitir re-escribir un mes pasado cuando `clientes_incluidos`
   creció — pero eso rompe la regla del congelado, así que se dejó como está.
4. **Sin backfill**: la serie arranca vacía y se llena mes a mes desde el
   despliegue. Rellenar hacia atrás sería inventar datos. Los primeros meses en
   producción se van a ver como `sin_dato`, que es lo honesto.
5. **`_iso_z` repone UTC a los `datetime` naive que devuelve SQLite.** En
   Postgres (producción) vuelven con `tzinfo` y el camino es un no-op; queda
   anotado porque es la clase de diferencia que sólo aparece al desplegar.
6. **`tests/test_recordatorios.py` es flaky, y NO es por esta fase.** Falla de
   forma intermitente y en tests distintos cada corrida (recibe 2 correos donde
   espera 1): es el hilo de mantenimiento que el `lifespan` lanza al arrancar
   corriendo `check_expiring_leases` a la par del cuerpo del test. **Verificado
   revirtiendo mi cambio de `main.py`**: con `cerrar_mes_anterior()` fuera, 2 de
   3 corridas siguen fallando igual. Mi cambio alarga el arranque del hilo, así
   que puede ensanchar la ventana de la carrera, pero no la crea. Arreglarlo
   pide sincronizar ese hilo con los tests — fuera del territorio de esta fase.

7. **El caché de métricas sigue siendo por proceso** (pendiente heredado de la
   Fase 4): con más de un worker de uvicorn, cada uno haría su propio
   write-through. Es idempotente, así que no corrompe nada — sólo escribe de más.
