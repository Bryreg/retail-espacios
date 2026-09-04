# Auditoría C — Fase 5 (Tendencia temporal)

Auditor independiente. Revisión del build ya aplicado en el árbol de trabajo
(rama `claude/fase-5-tendencia`). Foco: verificación real (suite entera +
tsc/build), cumplimiento de los guardrails no negociables, y hallazgos de
corrección. No hice commit ni push.

## Veredicto

**Apto para revisión, con UNA corrección recomendada antes de merge (BUG-1).**
La arquitectura respeta todos los guardrails duros (sin migración, una sola
frontera de privacidad aplicada al leer, consolidado ponderado, ruta literal,
tolerancia a fallos, frontend sin librería de charts). No hay regresiones de
Fases 1-4. El único defecto de corrección con impacto real es BUG-1 (el
consolidado de un mes pasado puede contradecir a sus propios sumandos), ya
documentado y reproducido con `xfail(strict=True)`; coincido con el conciliador
en que es bloqueante para el valor central de la fase y el arreglo es acotado.

## Verificación ejecutada (yo mismo)

- `python -c "import app.main"` → **OK**. No hay ciclo de import pese a la
  cadena `models/plataforma → plataforma_tendencia → plataforma_metricas`
  (el write-through importa `persistir_snapshots` de forma LOCAL dentro de
  `calcular`, y `plataforma_tendencia` importa los modelos dentro de las
  funciones; el único import de nivel de módulo entre esos tres es
  `tendencia → metricas`, que no cierra el ciclo).
- `frontend && npx tsc --noEmit` → **limpio**.
- `frontend && npm run build` → **limpio** (built in ~18s).
- `backend && python -m pytest -q` (suite ENTERA) → **0 failed**. En una primera
  corrida aparecieron 8 ERROR, TODOS idénticos y ajenos a la Fase 5:
  `RuntimeError: Directory '/tmp/retail-espacios-test/frontend/dist/assets'
  does not exist` en el setup del fixture `client` (montaje de `StaticFiles`).
  Es un ARTEFACTO DE CONCURRENCIA: varios agentes hermanos corren pytest y
  reconstruyen/borran `frontend/dist` sobre el MISMO árbol de trabajo al mismo
  tiempo, y `dist/assets` no estaba en el instante en que esos 8 clients se
  construyeron. Rehíce esas mismas pruebas con `dist/assets` presente
  (`test_montaje_enlace.py`, `test_metricas_conciliacion.py`) → **todas
  verdes**. No son regresiones del código.
- Suites nuevas de tendencia (`test_plataforma_tendencia.py`,
  `test_tendencia_ataques.py`, `test_tendencia_conciliacion.py`) → **verdes**,
  con **1 xfail** (BUG-1, `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`).
- Capturas `capturas/tendencia-claro.png` / `-oscuro.png` revisadas: línea SVG
  con eje desde cero, mes en curso con tramo punteado + punto hueco + rótulo
  "parcial", estado vacío honesto con 1 mes, marcador rayado de K=3 con corte de
  línea (sin interpolar sobre el hueco), y ticks "sin dato" con segmentos
  cortados. Coincide con la spec.

Nota de entorno: el árbol `/tmp/retail-espacios-test` es compartido por varios
auditores corriendo en paralelo (vi runs concurrentes con `rm -f *.db` y
rebuilds de `dist`). Una corrida "sola" y determinista de la suite entera exige
un árbol aislado; con eso, la única fuente de rojo observada desaparece.

## Cumplimiento de los guardrails (todos OK)

- **SIN MIGRACIONES.** `SnapshotMetricas` es tabla NUEVA del registro, creada por
  `create_all()` igual que `estados_cliente`/`bitacora_plataforma`. El diff de
  `models/plataforma.py` sólo AGREGA una clase; cero columnas en tablas
  existentes. `UNIQUE(cliente_slug, periodo)` presente.
- **Una sola frontera de privacidad, aplicada al LEER.** La tabla guarda crudos;
  `publicar_fila` reusa `_pct`, `_plata`, `_top` (saneo) y
  `_suprimir_celda_chica` (K=3). Buen refactor de soporte: se extrajo
  `publicas_desde_crudos` en `plataforma_metricas`, que ahora usan tanto Fase 4
  (`_metricas_de_un_cliente`) como el read de Fase 5 — un único lugar donde el
  crudo se vuelve público. `contratos_activos` y `ocupadas` NUNCA salen al JSON
  (son numerador/denominador de la propia supresión); verificado por
  `test_contratos_activos_y_ocupadas_nunca_salen_al_json`.
- **Consolidado ponderado (Σ/Σ).** Se guardan SUMAS crudas; canon promedio y
  ocupación se derivan al leer. Cubierto por `test_consolidado_ocupacion_es_ponderada`,
  `_canon_es_ponderado`, `_usuarios_son_distintos`. Verifiqué que recortar el
  top a 5 al ESCRIBIR (`_recortar_top`) no cambia el top publicado: usa la misma
  clave de orden `(-conteo, nombre_original)` que `_top`, así que top-5 de la
  cola completa == top-5 del recorte.
- **Frontera del operador intacta.** `/tendencia` es `require_operador`, sólo
  lectura, agregada, con `bitacora_plataforma` (`accion="tendencia"`, el QUÉ es
  el rango `cliente:desde..hasta`). No abre ninguna base de cliente: lee sólo el
  registro. `meses` fuera de rango → 422; slug inexistente → 404 con texto fijo.
- **Ruta LITERAL antes de las paramétricas.** `/tendencia` (línea 110) va después
  de `/metricas` y ANTES de `/supresiones/{id}` (209) y `/clientes/{slug}` (295).
- **Poblado tolerante y idempotente.** `persistir_snapshots` y
  `cerrar_mes_anterior` van en su propio try/except y NUNCA propagan (la foto de
  `/metricas` y el ciclo de mantenimiento no dependen del histórico). Write-through
  colgado del CÁLCULO real, no del endpoint (un acierto de caché no recalcula ni
  trae crudos). Upsert idempotente por `(cliente_slug, periodo)`; regla del
  congelado correcta (mes en curso converge, mes pasado se congela).
- **Frontend.** Gráfico de LÍNEA en SVG propio, sin librería de charts, tokens
  `--con-*` (agrega `--con-linea*` en claro y oscuro con contraste ≥3:1), mes en
  curso marcado parcial, estado vacío honesto con <2 meses, sin interpolar sobre
  huecos (la línea se corta en cada `sin_dato`/suprimido). No usa `localStorage`.
  Bajo la CSP de Fase 3 (nada externo). `tsc` y `build` limpios.
- **Legado / JWT / redacción por rol:** sin cambios.

También confirmo que la actualización de la prueba de regresión existente
`test_m25...` (ahora `...y_el_snapshot`) es LEGÍTIMA, no un enmascaramiento:
espera exactamente +4 filas de `snapshot_metricas` en la primera consulta de
`/metricas` (3 clientes legibles + consolidado) y 0 en la segunda (caché), que
es el comportamiento correcto del write-through-sobre-cálculo.

## Hallazgos

### BUG-1 — RECOMENDADO ARREGLAR ANTES DE MERGE (corrección; el artefacto central de la fase)
El consolidado de un mes PASADO queda congelado y NO incluye a los clientes cuya
fila por cliente se INSERTÓ después del cierre — un cliente fundado más tarde con
contratos retroactivos a ese mes, o un cliente cuya base estaba ilegible durante
el cierre automático y luego se recuperó. Cuando alguien abre `/metricas` de ese
mes, el write-through INSERTA la fila del cliente pero deja intacta la fila
`__consolidado__` (mes pasado ⇒ congelada). Resultado: el punto consolidado de la
serie contradice a sus propios sumandos — subestima ingreso y ocupación, que es
justo la lectura que la fase existe para dar.
- Reproducido con números exactos en
  `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues`
  (`xfail(strict=True)`, mantiene la suite en verde; XPASS cuando se arregle).
- Ubicación: `app/plataforma_tendencia.py::persistir_snapshots`, rama del
  `CONSOLIDADO_SLUG` bajo la regla del congelado.
- Arreglo acotado (lado builder): al persistir un mes PASADO, si se INSERTÓ
  alguna fila por cliente, recalcular/actualizar la fila `__consolidado__` de ese
  mes a partir de las filas por cliente presentes (podría reusarse
  `consolidar_agregado`, ver nit de abajo). El congelado sigue protegiendo lo ya
  escrito por cliente; la invariante a restaurar es "el total nunca contradice a
  sus sumandos".

### BUG-2 — MENOR (eficiencia; sin corrupción)
`cerrar_mes_anterior` da el mes por cerrado sólo si `esperados <= presentes`
(todo slug del registro tiene fila). Un cliente con base rota nunca recibe fila
(correcto: no se inventan ceros), así que la guarda no se cumple NUNCA mientras
esa base siga rota, y cada corrida del mantenimiento (cada 12 h) vuelve a
recorrer TODAS las bases para no escribir nada nuevo. No corrompe datos (el
congelado protege lo escrito), pero es un recorrido completo, indefinido,
disparado por un cliente que ya se sabe que falla. Documentado (pasa) en
`test_HALLAZGO_cierre_reintenta_para_siempre_con_un_cliente_roto`. Combinado con
BUG-1 es el camino más probable a un consolidado congelado inconsistente.
Mitigación posible: considerar el mes cerrado cuando estén el consolidado + los
clientes LEGIBLES en ese momento, o registrar un intento para no re-escanear.

### OBS-3 — MENOR (mío, sin cobertura de test): consolidado "vacío pero presente"
Si en una captura fallan TODOS los clientes (o el registro no tiene clientes),
`persistir_snapshots` igual escribe una fila `__consolidado__` con ceros
(`contratos=0`, `clientes_incluidos=0`). Al leer, ese punto sale con
`sin_dato=False`, `ocupacion_pct=null` e ingreso suprimido por K=3 sobre 0 —
"presente pero vacío" en vez de `sin_dato`. Es incoherente con el principio
"un hueco es la verdad" que sí se aplica por cliente. Impacto bajo (toda la
plataforma caída en el instante de la captura), pero conviene, o bien no escribir
la consolidada cuando no hubo ningún cliente legible, o dejar constancia de la
decisión.

### NIT-4 — Docstring engañoso + duplicación latente de la suma consolidada
`consolidar_agregado` (en `plataforma_metricas.py`) afirma en su docstring que la
usa "cada punto consolidado de la tendencia (Fase 5)". No es así:
`plataforma_tendencia.py` NO importa ni llama a `consolidar_agregado` — arma y
guarda la fila consolidada CRUDA por su cuenta en `persistir_snapshots` (Σ caras
/ ocupadas / contratos, fusión de proveedores, dedup de usuarios). No es un bug
(ambos caminos ponderan igual hoy), pero es duplicación de la lógica de suma con
riesgo de divergencia si un día cambia el ponderado en un solo lado, y va contra
el "un solo lugar" de la spec. Sugerencia: encaminar el arreglo de BUG-1 a través
de un helper de suma cruda compartido, y de paso corregir el docstring.

## Qué probé y no encontré problema
- Reuso de K=3/saneo idéntico entre `/metricas` y `/tendencia` (misma función).
- Orden de rutas y `require_operador` + bitácora del nuevo endpoint.
- Idempotencia del upsert y regla del congelado (mes en curso vs pasado).
- `contratos_activos`/`ocupadas` fuera del JSON.
- Frontend: sin interpolar huecos, parcial marcado, estado vacío honesto,
  sin `localStorage`, sin librería de charts, claro+oscuro.
- Sin regresiones de Fases 1-4 (las 8 ERROR eran el artefacto de `dist/assets`).

## Archivos relevantes
- `backend/app/plataforma_tendencia.py` (NUEVO): write-through, cierre, lectura.
- `backend/app/plataforma_metricas.py`: refactor `publicas_desde_crudos` /
  `consolidar_agregado`, `calcular(origen=...)`, gancho write-through.
- `backend/app/routers/plataforma.py`: `GET /plataforma/tendencia` (literal).
- `backend/app/models/plataforma.py`: modelo `SnapshotMetricas`.
- `backend/app/main.py`: gancho `cerrar_mes_anterior()` en `_run_lease_maintenance`.
- `frontend/src/components/plataforma/tendencia.tsx` (NUEVO): gráfico SVG + hook.
- `frontend/src/api/plataforma.ts`, `src/pages/Plataforma.tsx`, `src/index.css`.
- Foco del arreglo BUG-1: `plataforma_tendencia.py::persistir_snapshots`
  (rama `CONSOLIDADO_SLUG`).
