# ENTREGA FINAL — Vitrinas 3D: tarifas, semáforo de ocupación y dashboard (RECABRA)

**Maestro Orchestrator** · 2026-09-03 · Repo: `/tmp/retail-espacios-test` · Rama: `claude/sistemas-maestros-retail-mzb1om` (**sin commit ni push** — le toca al humano)
**Ciclo:** 2 rondas · Conciliador final: **coherente, 0 conflictos accionables** · Verificación: `tsc` limpio, `import app.main` OK, suite backend **276/276 en verde**.

**En una línea:** la feature está construida, testeada y auditada dos veces; las tres fugas bloqueantes de privacidad se cerraron y verificaron en caliente; el motor de P&L quedó correcto al peso; quedan abiertos —explícitos abajo, nunca ocultos— dos bloqueantes contables nuevos (C-1, C-3) y la decisión arquitectónica del modelo dual, que no era resoluble por builders sin permiso de migrar.

---

## 1. El equipo: quiénes, por qué, y qué se descartó

| Agente | Modelo | Tipo | Por qué existe así |
|---|---|---|---|
| `builder-rates-api` | sonnet | builder | Adaptación de `agente-backend.md` con los guardrails del repo que **contradicen** la librería genérica: acá rige "sin migraciones" (nada de Alembic; tablas nuevas sí, vía `create_all()`). Las tarifas existían a nivel tabla (`/layout/rates`, admin-only) pero no por espacio, y el tipo de mueble no vive en `spaces` sino en el JSON del layout → el endpoint tenía lógica real, no CRUD. |
| `builder-vitrina-3d` | sonnet | builder | **Rol NUEVO** — la librería no tenía especialista Three.js/react-three-fiber. El trabajo era dentro de un monolito de 5.490 líneas con reglas duras propias: pintar materiales sin crear geometría, `frameloop='demand'`, caras A/B por índice de material 5/4, guards por identidad de array. |
| `builder-dashboard-ocupacion` | sonnet | builder | **Fusión** de `agente-frontend.md` + `agente-analytics.md`. El agente Analytics de la librería (haiku, solo specs) se descartó como rol aparte: acá el dashboard había que CONSTRUIRLO, y las fórmulas KPI exactas fueron embebidas en la misión. |
| `auditor-legal-precios` | opus | auditor | Adaptación de `agente-legal.md`. El repo tiene 4 canales de fuga posibles (respuestas API, `localStorage`/partialize, lámina exportada, correos) y un vector sutil: el % de desvío contra una referencia pública reconstruye el precio negociado. Razonamiento de vectores indirectos → opus. |
| `auditor-contador-pl` | opus | auditor | Adaptación de `agente-contador.md`. El riesgo central es el modelo dual (JSON del layout ↔ `space_leases`) más prorrateo con rangos inclusivos y tarifa por cara. Conciliar dos fuentes de verdad contables → opus. |

**Paralelismo:** los 3 builders tuvieron territorios de archivos disjuntos (backend completo / `StoreEditor3D`+`api/spaces.ts`+utils / `Dashboard*`+`api/dashboard.ts`+`components/Ocupacion/`) contra un contrato de API fijado por adelantado — ninguno esperó a otro. Los 2 auditores fueron read-only. El **Conciliador** de la librería no entró al roster: es infraestructura de Fase 2 del orquestador y corrió después de los cinco.

**Validación del diseño con el resultado:** el especialista 3D nuevo justificó su existencia (detectó que `zones.ts` del brief era código muerto y que el violeta pedido contradecía una auditoría de dicromacia); el contrato fijado por adelantado aguantó las 2 rondas sin un solo cambio de forma (solo cambiaron valores); y los dos auditores en opus produjeron los hallazgos que definieron la ronda 2.

---

## 2. Qué construyó / halló cada agente

### `builder-rates-api` — backend completo (informe: `outputs/builder-rates-api.md`)

**Construyó (ronda 1):**
- `GET /api/spaces/{code}/rates` — tarifa de referencia (solo admin, clave **ausente** para worker, no null) + ocupación por período o de hoy. Resuelve el tipo de mueble desde el snapshot del layout, cara B con sufijo `-B`.
- `GET /api/dashboard/ocupacion` — por sede: caras, contratadas, montadas, vencidas, % esperada/real, e ingresos (admin-only, claves ausentes para worker).
- `backend/app/services/ocupacion.py` — **nuevo, 443 líneas**, el núcleo: toda la lógica de tarifa+ocupación; los routers quedan delgados.
- Tests: `test_space_rates.py`, `test_dashboard_ocupacion.py`.

**Arregló (ronda 2, por asignación del Maestro tras los conflictos):**
- **Prorrateo `/30`** del ingreso (CONFLICTO-1): `monthly_rent/30 × días de intersección inclusiva`, misma convención que firma el proveedor en `Contrato.tsx:283`. Antes un contrato de 1 día sumaba el mes entero (+2.900%).
- Tabla nueva **`LeaseCancellation`** (`models.py`, vía `create_all()`, sin ALTER): la baja de contrato registra `cancelled_at` en la misma transacción; el devengado hasta la cancelación ya no se borra.
- **Cierre de PII** (CONFLICTOS 2 y 3, preexistentes): `SupplierPublicOut` (solo `id`+`name`, lista blanca) en `suppliers.py` y en el `supplier` anidado de `SpaceOut`; `lease.notes = null` para no-admin; `observation` popeada en las 3 profundidades de `layout.py`. Test nuevo: `test_redaction_pii.py` (la sonda "descuento del 25% cerrado por telefono" como canaria).
- `Cache-Control: no-store, max-age=0` en `/rates` (CONFLICTO-4).

Archivos: `backend/app/{services/ocupacion.py, models/models.py, routers/{spaces,dashboard,layout,suppliers}.py, schemas/spaces.py}` + `backend/tests/{test_space_rates,test_dashboard_ocupacion,test_redaction_pii}.py` (55 tests nuevos).

### `builder-vitrina-3d` — semáforo de ocupación en el 3D (informe: `outputs/builder-vitrina-3d.md`)

**Construyó:** Modo Ocupación en el editor 3D — interruptor + `SeasonPicker` real (el mismo componente de Vender), cada cara comercializable pintada con la **terna auditada** (`--libre`/`--entra`/`--ocupado`) según `rangeAvailability` (la MISMA función del mapa 2D, sin segunda regla), góndola doble con sus dos caras por separado (índices de material 5/4), leyenda rotulada, tooltip por período, y bloque de tarifa de referencia en el panel del mueble vía `GET /spaces/{code}/rates` con degradación a null. Sin geometría nueva, sin `invalidate()` de más, sin tocar los guards del store — los 7 guardrails verificados uno por uno en su informe.

Archivos: `frontend/src/components/StoreEditor3D/StoreEditor3D.tsx` (~270 líneas sobre 5.490), `frontend/src/utils/semaforo3d.ts` (**nuevo**), `frontend/src/api/spaces.ts`.

**Halló (los 2 que importan de sus 8 gaps):**
- **El violeta del brief era una trampa:** `docs/ESTADO.md` y `DashboardView.tsx` dicen explícito que el violeta para "contratado, aún no arranca" se sacó a propósito tras la auditoría de dicromacia; toda vista por período usa SIEMPRE la terna de tres. **No lo implementó** y lo reportó — decisión correcta, avalada por el Conciliador (conflicto-5, cerrado como "brief desactualizado").
- `FloorMap/zones.ts` (la pista del brief para "cómo pinta el 2D") es código casi muerto con paleta vieja; la fuente de verdad es `rangeAvailability` + `RANGE_TOP`.

### `builder-dashboard-ocupacion` — ocupación real vs esperada (informe: `outputs/builder-dashboard-ocupacion.md`)

**Construyó:** sección nueva al pie de Supervisar (nunca en Vender, regla de ESTADO.md): barras esperada/real por sede —todas las sedes, la actual resaltada con texto—, tabla accesible, y la **brecha accionable** (lista de códigos contratados-sin-montar, calculada client-side con datos ya en memoria, visible también para worker porque no lleva plata). Dinero con **doble candado**: `isAdmin && "ingreso_contratado" in fila` (presencia de clave, nunca `!== null`). Colores de tinta neutra, no del semáforo (una barra "Real" verde se leería como "libre"). En ronda 2 re-rotuló las cifras como "devengado del período (prorrateado)" para no chocar con el "Canon vigente" de la franja de arriba, y **decidió no mostrar ningún % ni resta entre las dos cifras** — con el prorrateo el signo puede ir en ambos sentidos.

Archivos: `frontend/src/components/Ocupacion/{Ocupacion,BarraSede,TablaOcupacion}.tsx` + `format.ts` + `types.ts` (**nuevos**, 511 líneas), `frontend/src/api/dashboard.ts`, `frontend/src/pages/DashboardView.tsx` (+56 líneas).

Su gap #1 (el backend aún no tenía el prorrateo cuando escribió) **quedó cerrado**: `builder-rates-api` lo aplicó y el contador lo verificó al peso.

### `auditor-legal-precios` — qué precio ve cada rol (informe: `outputs/auditor-legal-precios.md`)

Método: sonda en caliente con 4 credenciales (admin/worker/token montaje/anónimo) sobre app real sembrada con canaria, barrido dinámico de 33 rutas, lectura de código para correos/localStorage/lámina.

- **Ronda 1:** 3 bloqueantes/advertencia accionables — H1 (PII de proveedor entera al worker), H2 (`lease.notes` y `fixture.observation` con el descuento negociado en texto libre), H5 (sin `no-store`). Todos **preexistentes**, no de los builders nuevos.
- **Ronda 2:** los tres **CERRADOS y verificados en caliente** (canaria en 0 apariciones sobre el texto completo de 19 respuestas de worker; barrido de 33 rutas todas 401 para token de montaje).
- **Vector indirecto del desvío %:** inventarió los 6 lugares donde se muestra un desvío; los 6 cierran por 3 candados independientes (el server no manda referencia, no manda negociado, el cliente no persiste ni pide). Documentó el oráculo de `bulk/validar` (cerrado por `require_admin` — "si alguien lo afloja, este es el agujero") y la fuga por diferencia de agregados (por qué los ingresos jamás deben bajar de admin, ni redondeados).
- **Veredicto del ítem de spec "Tarifas de referencia ocultas a worker": CUMPLE, sin reservas.**
- Pendientes (decisión del maestro, ninguno bloqueante): H3, H4, H6, H7, H8, H9, N1, N2 — ver §5.

### `auditor-contador-pl` — P&L por sede/temporada (informe: `outputs/auditor-contador-pl.md`)

Método: app real + semilla reproducible (5 caras, 9 contratos, 4 temporadas, 4 bancos aislados), cuenta independiente en Python **y** query SQL de control — las tres coinciden 4/4.

- **Ronda 1:** el P&L estaba roto — temporada cerrada $0 (−100%), vigente +47,1% con el **signo del desvío invertido** (+41% "sobre lista" cuando la verdad era −4,1% bajo lista), contrato de 1 día +2.900%. Origen: suma de `monthly_rent` completo sin prorratear + filtro por `is_active`.
- **Ronda 2:** **el motor quedó correcto al peso** — las 4 temporadas dan divergencia $0,0%; doble conteo descartado con número; cancelación a mitad de plazo conserva el devengado exacto ($60.000 = 3 días); la ficha que firma el proveedor coincide con el P&L del plazo ($3.100.000 = $3.100.000).
- **Halló 4 cosas nuevas** que el fix destapó: **C-1 y C-3 bloqueantes** (ver §5), C-2 (huso horario) y C-4 (rótulo del techo).
- **Veredicto de los ítems de spec:** "P&L cuadra" → **NO a nivel de sistema** (motor correcto; lo que falta es C-1, C-3 y la decisión del modelo dual). "Ocupación en colores" → la mitad aritmética sólida (13 validaciones re-verificadas: denominador por cara, góndola doble = 2, rangos inclusivos, dinero jamás al worker), pero **B-5/B-6/B-7 abiertos** — incluido el caso más caro: el JSON solo sostiene 1 contrato por cara, así que una punta vendida 30/30 días en dos contratos se pinta **naranja "se libera"** y el semáforo ofrece vender 14 días ya vendidos.
- Trazabilidad: el hueco más caro **quedó cerrado** (`cancelled_at` es permanente; antes la fecha de cancelación moría con la purga de bitácora a los 365 días).

---

## 3. Estado de coherencia (historial del ciclo)

| Ronda | Agentes | Conflictos | Resultado |
|---|---|---|---|
| 1 | los 5 | **7** — 3 bloqueantes (P&L sin prorratear; PII proveedor; notes/observation sin redactar) + 4 advertencias (Cache-Control; violeta vs ESTADO.md; `rate_type_of` triplicado; brecha solo sede actual) | **no coherente** |
| 2 | 4 (sin `builder-vitrina-3d`, cuyo trabajo no tenía conflictos accionables) | **0** | **coherente** — veredicto final del Conciliador |

**Qué significa "coherente" acá, sin humo:** ya no hay conflictos **entre agentes** ni bloqueantes **accionables dentro del alcance asignado** — los 3 bloqueantes de ronda 1 se arreglaron, se re-auditaron en caliente y quedaron fijados por tests. NO significa "sistema sin hallazgos": los auditores dejaron abiertos hallazgos que exceden el mandato de los builders (uno arquitectónico que exige decisión humana, dos contables nuevos descubiertos EN la ronda 2, tras el corte de asignación). Están todos en §5.

Los conflictos 5, 6 y 7 de ronda 1 se cerraron como "documentado/deliberado": el violeta NO va (auditoría de dicromacia manda sobre el brief), la triplicación de `rate_type_of` es refactor futuro, y la brecha por-sede-en-pantalla es diseño aceptado.

---

## 4. Resultado de verificación (contra código, no contra los informes)

```
cd frontend && npx tsc --noEmit          → exit 0 (doble corrida, tsc 5.9.3)
cd backend  && python -c "import app.main" → exit 0
cd backend  && python -m pytest -q        → 276 passed, 0 failed (suite completa, 3 corridas)
```

**Diff contra `main`:** 10 archivos trackeados (680+/32−) + 7 rutas nuevas sin trackear: `services/ocupacion.py` (443), 3 archivos de test (887 líneas, 55 tests), `semaforo3d.ts`, `components/Ocupacion/` (511) y estos outputs. La tabla `LeaseCancellation` se auto-crea en deploy vía `create_all()` (crea tablas faltantes; no migra columnas — y no hay ninguna columna nueva).

**Checklist del spec:**

| Ítem | Estado | Resumen de evidencia |
|---|---|---|
| Mapa sincroniza con BD en tiempo real | **CUMPLIDO** (con salvedad) | Polling de 20s + eventos focus/visibility/online en `fixtureStore.ts` — infraestructura preexistente de la que el semáforo se aprovecha; no es push/websocket. |
| Tarifas de referencia ocultas a worker | **CUMPLIDO** | Redacción 100% server-side por lista blanca, clave ausente (no null), en `/rates` y `/ocupacion`; 5 capas verificadas en caliente por el auditor legal; 55 tests en verde. El mismo PR cerró además las 2 fugas de PII preexistentes. |
| P&L cuadra vs ingresos reales | **PARCIAL** | La aritmética `/30` es correcta y está testeada (4/4 temporadas al peso, SQL de control). NO cuadra a nivel sistema por C-1, C-3 (§5, sin fix ni test en este diff) y el modelo dual (B-5, decisión pendiente). |
| Ocupación por período reflejada en colores | **CUMPLIDO** | Semáforo 3D con la terna auditada + leyenda + tooltip, reusando `rangeAvailability` del 2D; barras por sede en Dashboard; 20 tests backend. Salvedad heredada del modelo dual: el JSON solo guarda 1 contrato/cara (§5.b). |

Sin suite de tests de frontend en el repo (solo `tsc` + `vite build` OK) — StoreEditor3D y `components/Ocupacion/` no tienen tests automatizados.

---

## 5. Conflictos y hallazgos NO resueltos — explícitos, nunca ocultos

### (a) Bloqueantes contables en el código nuevo, sin fix ni test de regresión (verificados presentes)

- **C-1 — La cancelación histórica con `end_date` ya pasado se reporta COMPLETA.** Un lease `is_active=False` sin fila en `lease_cancellations` (cancelado antes del deploy) cuyo `end_date` quedó atrás cae en la rama "temporada cerrada" y suma el plazo entero: un contrato caído a los 5 días reporta el mes ($900.000 en vez de $150.000). Peor: **el número salta solo con el calendario** — el P&L de septiembre de ese lease es $0 consultado el 30-sep y $900.000 consultado el 1-oct, sin que nadie toque nada. Un cierre no se firma sobre un número que se mueve solo. Cero tests cubren `is_active=False` sin fila.
- **C-3 — Plata y ocupación se contradicen en la misma fila del mismo endpoint.** `_ingreso_periodo_dias` usa elegibilidad por fechas+cancelación; `_cubre_periodo` (que alimenta `contratadas`/`ocupacion_esperada_pct`) sigue filtrando por `is_active`. Resultado medido: junio devuelve `ingreso_contratado=$1.000.000` junto a `contratadas=0` y `esperada=0.0%` — una sede que cobró un millón "sin haber vendido nada". El código lo declara intencional; el auditor lo marca bloqueante porque la contradicción es **interna a una misma respuesta**.

### (b) Arquitectónico — requiere decisión humana, fuera del mandato de los builders (dictamen del Conciliador)

- **B-5 — El modelo dual `space_leases` ↔ JSON de `layout_snapshots` no concilia.** `UnifiedFixture` sostiene UN contrato por cara; septiembre tiene 6 leases y el JSON solo 4 → **$613.333 de devengado real (16,4% del período) invisibles en toda pantalla**. Tres cifras de "ingreso" para la misma sede el mismo día: $2.700.000 (Canon vigente, JSON) / $3.500.000 (`/kpis`, sin prorratear) / $3.740.000 (`/ocupacion`, prorrateado) — spread 28% (bajó del 75% de ronda 1, no a cero). Consecuencia operativa cara: el semáforo (2D y 3D leen el JSON) pinta "se libera" una punta vendida el período completo en dos contratos → **ofrece vender dos veces el mismo espacio**. La pregunta pendiente es de producto: ¿qué fuente manda para P&L?
- Derivados del mismo techo, abiertos: **B-6** (`vencidas` cuenta caras libres en períodos futuros: 5/5 en diciembre), **B-7** (`ocupacion_real_pct` se contamina entre temporadas: diciembre reporta 50% real por un montaje de septiembre), **B-8** (carga masiva escribe en el plano de la sede equivocada, preexistente), **B-9** (la carga masiva —el camino que más plata mueve— no deja bitácora).

### (c) Advertencias y notas abiertas (ninguna bloquea la feature)

- **C-2** — `cancelled_at` en UTC leído como día calendario: cancelar después de las 19:00 COT devenga un día de más (+`monthly_rent/30`, determinístico, siempre a favor del que factura).
- **C-4 / A-3 / A-4** — rótulos del techo (`ingreso_a_referencia` puede superar el 100% del techo mensual en períodos de 31 días y es correcto; caras sin tarifa desaparecen del techo en silencio).
- **H3** — `top_suppliers` viaja al worker **ordenado por plata** (los montos en 0.0 pero el orden ES el ranking comercial). **H4** — `/kpis` manda `0.0` donde los endpoints nuevos mandan ausencia (cuatro convenciones de redacción conviviendo). **H6** — `layout.py`/`spaces.py` siguen en lista negra; el olvido ya ocurrió dos veces (`observation`, `notes`) — `SupplierPublicOut` es el patrón a generalizar. **H7** — el correo de montaje de la tanda (todo contrato multiespacio) va sin enlace firmado → empuja a la mercaderista a la clave compartida de worker. **H8** — un contrato escaneado en JPG es descargable por worker (filtro por content-type). **H9** — recuadro "Tarifa de referencia" puede dibujarse sin tarifa (hoy inalcanzable: worker no ve el 3D).
- **N1** — 3 cierres sin test que los fije (el `no-store` de H5; `supplier` redactado en `/spaces/`, `/{id}`, `/by-svg/`; redacción en `upcoming_lease`) — una línea de test cada uno. **N2** — los tipos del cliente (`types/index.ts`) mienten sobre la forma redactada (claves declaradas presentes que ahora vienen ausentes). **N3** — `test_clientes.py` es flaky en HEAD limpio (arnés multi-cliente + `/tmp` compartido), preexistente, no de esta feature.
- **`docs/ESTADO.md` NO fue actualizado** — y `CLAUDE.md` lo exige en el mismo PR: la convención `/30`, la tabla `lease_cancellations` con su limitación (los DOS casos, incluido C-1), y la divergencia declarada `kpis` vs `ocupacion` no están escritas en el documento vivo. Hoy la próxima sesión no se entera de que existen.
- Menores documentados: `rate_type_of` triplicado (cliente/bulk_leases/ocupacion.py); la brecha con códigos solo cubre la sede en pantalla (para otras sedes hace falta endpoint nuevo); el período del `SeasonPicker` es estado local por pantalla, no global (así estaba en toda la app; el brief asumía otra cosa); capturar la lámina con Modo Ocupación prendido exporta el semáforo, no el producto.

---

## 6. Próximos pasos concretos, priorizados

1. **Commitear y abrir PR de este trabajo, incluyendo la actualización de `docs/ESTADO.md` en el MISMO PR** (regla de `CLAUDE.md`): tres párrafos — convención `/30`, `lease_cancellations` + limitación con los dos casos, divergencia `kpis` vs `ocupacion`. Sin esto, la próxima sesión escribe un cuarto prorrateo. *(minutos; desbloquea el deploy — `LeaseCancellation` se auto-crea)*
2. **C-1: backfill único de `lease_cancellations` desde `audit_log`** (`accion='contrato.baja'`) + fila `cancelled_at=end_date` para lo que ya no tenga bitácora + test con `is_active=False` sin fila. **Es la única corrección con ventana que se CIERRA**: la bitácora se purga a los 365 días y cada día que pasa se pierde la fecha real de una cancelación más. Sin migración: es escribir filas en una tabla nueva. *(chico, urgente)*
3. **C-3: que `_cubre_periodo` use la misma elegibilidad que `_ingreso_periodo_dias`** (fechas + cancelación, no `is_active`) + test. NO tocar `occupancy_range` del semáforo con el mismo criterio: "cancelado no ocupa" es correcto para vender; "ocupó los días que ocupó" es correcto para contar — dos funciones con nombres distintos. *(la más barata del lote)*
4. **Decisión de producto (humano): ¿qué fuente manda para P&L?** — el modelo dual (B-5). Recomendación de los auditores: `space_leases` para todo dinero, el JSON solo pinta. Primera implementación cuando exista la decisión: la franja "Canon vigente" pasa a `space_leases` con la regla `/30` sobre "hoy". Resuelve los $613.333 invisibles, el spread de 3 cifras y el riesgo de **doble venta** del semáforo. *(la que más plata mueve; bloqueada solo por la decisión)*
5. **B-6 y B-7:** rotular/filtrar — "libres/vendibles" en vez de `vencidas` para períodos futuros; filtrar el reporte de montaje por las fechas del contrato del período (o rotular `ocupacion_real_pct` como "solo válido para el período que contiene hoy"). *(independientes, baratas)*
6. **C-2:** corregir el huso de `cancelled_at` (restar offset de Colombia antes de `.date()`, o guardar el día comercial). *(una línea con test)*
7. **Higiene de redacción:** H3 (sacar el orden por plata —o `top_suppliers` entero— del `/kpis` de worker), N1 (3 tests de una línea que fijen lo recién cerrado), N2 (alinear `types/index.ts` con la forma redactada: opcionales, como ya hace `api/spaces.ts`), H4 (migrar `/kpis` a claves ausentes). *(medio día en total)*
8. **Deuda preexistente que excede la feature, en orden de riesgo:** B-8 (carga masiva pinta la sede equivocada — bug de datos con dinero), B-9 + bitácora de la tanda, H7 (enlace firmado en el correo de la tanda — hoy el flujo normal multiespacio elude el diseño "cerrado por defecto" del token de montaje), H8 (marcar imágenes-documento), A-5 (borrar proveedor con historia → 500), H6 (generalizar `SupplierPublicOut` como patrón).
9. **Menores, cuando toque:** endpoint de brecha por sede (`/dashboard/ocupacion/brecha`), unificar `rate_type_of` (3 copias), H9, aislar `TMPDIR` en `conftest.py` (flaky N3), evaluar suite de tests de frontend.

---

*Informes fuente, en este mismo directorio: `builder-rates-api.md` · `builder-vitrina-3d.md` · `builder-dashboard-ocupacion.md` · `auditor-legal-precios.md` · `auditor-contador-pl.md`.*
