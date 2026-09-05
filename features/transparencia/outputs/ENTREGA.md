# ENTREGA — Fase 7 · Transparencia

Rama `claude/fase-7-transparencia`, árbol de trabajo sin commitear (32 archivos
modificados, +2098/−1143, 5 nuevos). Fecha: 2026-09-05.

## Veredicto del Maestro

**La fase NO se cierra todavía. Falta una línea y una corrida.**

Las tres partes de la spec (A: fuera K=3; B: reporte de transparencia; C:
política v2 + re-consentimiento) están construidas, son coherentes entre sí
(ronda 2 sin conflictos) y la verificación independiente confirma cada cifra.
Pero la suite completa da **1 rojo determinista** (868 passed, 7 xfailed,
1 failed, dos corridas idénticas): `test_montaje_enlace.py::
test_el_token_no_abre_ningun_otro_endpoint`. No es un bug de producto — es el
guardián de "alguien agregó un endpoint" haciendo su trabajo — pero mientras
esté rojo, el token de montaje no está siendo barrido contra la ruta nueva.

Para cerrar: agregar `"slug"` al diccionario `relleno` de
`backend/tests/test_montaje_enlace.py:129` con un slug que exista en el fixture
y correr la suite completa dos veces en serie. Después, commit y PR.

## 1. Qué se construyó

### Parte A — K=3 fuera (backend-supresion)

- `backend/app/plataforma_metricas.py`: `K_MINIMO_CONTRATOS` y
  `_suprimir_celda_chica` eliminados con todas sus llamadas
  (`publicas_desde_crudos`, `consolidar_agregado`, `_consolidar`). `_spread`
  devuelve `None` sólo con 0 contratos o tarifa ≤ 0; el consolidado del
  spread vuelve a sumar a TODOS los legibles con tarifa (el filtro
  `publicables` desapareció).
- `backend/app/plataforma_tendencia.py::publicar_fila`: mismas reglas
  exactas, sin umbral. `contratos_activos` y `ocupadas` siguen sin salir por
  `/tendencia` (crudos de negocio); sólo el reporte los publica.
- `frontend/src/components/plataforma/consola.tsx` y `tendencia.tsx`: el
  estado `Suprimido ‹3` desapareció de tabla, tiles, gráfico y spread. Cero
  contratos se muestra como `—` / `sin dato` (ausencia, no supresión).
- Tests: 8 archivos reescritos conservando el conteo exacto de tests
  (`test_plataforma_metricas` 40, `test_metricas_conciliacion` 35,
  `test_plataforma_tendencia` 22, `test_tendencia_ataques` 32,
  `test_tendencia_conciliacion` 21, `test_asesoria_ataques` 19,
  `test_asesoria_contador` 21) más `test_metricas_ataques` y
  `test_plataforma_spread`. Único borrado: `test_f09` (frontera-5) en
  `test_auditoria_frontera.py` (12 → 11), reemplazado por un comentario que
  explica la resolución por decisión de producto.
- `grep -rn "K_MINIMO\|_suprimir_celda_chica\|Suprimido" backend/app
  frontend/src` → vacío.

### Parte B — Reporte de transparencia (backend-reporte + frontend)

- `backend/app/plataforma_reporte.py` (nuevo, 574 líneas): `CATALOGO`
  taxativo de **22 entradas** (cada una con clave, nombre, definición,
  fuente, finalidad, endpoints, tratamiento), armado del reporte desde
  `snapshot_metricas`, `bitacora_plataforma`, `consentimientos`,
  `solicitudes_supresion` y `_metricas_de_un_cliente` (spread del mes en
  curso). Sin migraciones, sin filas de contratos.
- `GET /api/clientes/mi-reporte-plataforma?meses=N`
  (`routers/derechos.py`): `require_owner`, exento del 402
  (`_EXENTOS_POR_HABEAS_DATA`), valida `meses` ANTES de cobrar el freno
  compartido con `/mi-export`. El slug sale de la membresía, nunca de un
  parámetro.
- `GET /api/plataforma/clientes/{slug}/reporte?meses=N`
  (`routers/plataforma.py:446-476`): `require_operador`, declarada después de
  las literales, anota `accion="reporte"` / `periodo="<slug>:<desde>..<hasta>"`
  en la bitácora. Mismo JSON que el del dueño.
- `frontend/src/pages/ReportePlataforma.tsx` (nuevo, 501 líneas): rutas
  `/reporte-plataforma` (dueño) y `/plataforma/reporte/:slug` (operador).
  Cuatro secciones (catálogo, valores mes a mes, quién lo consultó,
  derechos), vista imprimible con `@media print` sin cabecera de app,
  "Descargar JSON", claro/oscuro en pantalla y siempre claro en impresión.
  Botón "Reporte de transparencia" en `Dashboard.tsx` junto a export y
  supresión; botón "Reporte" por fila en `Plataforma.tsx`. Sin librerías
  nuevas.
- Tests nuevos: `test_plataforma_reporte.py` (19) y
  `test_transparencia_ataques.py` (64, del auditor de frontera).

### Parte C — Política y consentimiento (legal-compliance)

- `VERSION_POLITICA = "2026-09-v2"` (`models/consentimiento.py:41`). El flujo
  de re-consentimiento existente se dispara solo: login con fila vieja →
  `pedir_consentimiento: true`; `/aceptar-politica` → 204; relogin limpio.
  Legado (claves compartidas) intacto: no pide consentimiento, no puede
  pedir el reporte (403).
- `docs/legal/politica-datos.md` §5.3 reescrita (líneas 298-360): trato
  nuevo con "agregados exactos" / "sin umbral" / "reporte de transparencia",
  qué cambió respecto de v1, qué sigue prohibido, bitácora, derechos.
  Historial en §11. 10 marcadores `[VALIDAR CON ABOGADO]` conservados. Copia
  en `frontend/src/legal/` byte-idéntica (md5
  `8311ff630d40883d2e09c1311aa41837`).
- `/mi-export` y el reporte incluyen `version_aceptada`.

## 2. Coherencia

Dos rondas.

**Ronda 1 — 3 conflictos bloqueantes, todos resueltos en ronda 2:**

| Id | Qué | Resolución |
|---|---|---|
| C-1 | `top_proveedores` del reporte: backend `{nombre, contratos}`, frontend leía `contratos_activos` → `(undefined)` en pantalla | Tipo propio `ProveedorTopReporte {nombre, contratos}` en `api/plataforma.ts`; `ReportePlataforma.tsx` lee `p.contratos`. Verificado en captura (junio 2026: "2 contratos"). |
| C-2 | Freno 3/hora cobrado ANTES de validar `meses`: tres pedidos con `meses=0` bloqueaban el habeas data una hora sin entregar bytes | `derechos.py`: `1 <= meses <= MESES_MAXIMO` primero, freno después. `test_t36` pasa: tres 422 no consumen cupo, el siguiente legítimo da 200. |
| C-3 | Catálogo "taxativo" de 17 claves con `valores[]` publicando 5 más (`ocupadas`, `contratos_activos`, `canon_total`, `origen`, `capturado_en`) | 5 entradas nuevas en `CATALOGO` con `endpoints: ["reporte"]` → 22. `test_t62` fija la regla: ninguna clave en `valores[]` sin entrada. |

**Ronda 2 — coherente, sin conflictos.**

Decisiones del Maestro registradas (no conflictos, sino trade-offs asumidos):

- **L-3 (legal, media)**: el reporte comparte el freno de 3/hora con
  `/mi-export` (tabla `export_attempts`). Se mantiene: separarlo exige
  migración y la spec prohíbe migraciones. Consecuencia real: tres exports
  dejan al dueño sin reporte por una hora. Documentado en ESTADO; la política
  §7.1(c) dice "un límite de pedidos por hora" sin decir que es compartido.
- **A1 (frontera)**: el token del operador da 401 (no 403) fuera de
  `/api/plataforma/*`, por construcción. Más opaco que 403. Aceptado.
- **A2 (frontera)**: con `contratos_sin_tarifa == 0`, el operador despeja la
  tarifa de referencia con `ingreso/(1+spread/100)/n` (medido: 0,03 % de
  error). Antes K=3 acotaba el caso; ahora no tiene frontera. Es la misma
  decisión de producto de la fase, documentada en ESTADO:464-471 y
  caracterizada por `test_t58` para que no empeore en silencio. **Ver
  "humano" abajo: es una de las dos preguntas centrales para el abogado.**
- **A3**: el endpoint del operador no tiene freno de tasa; se controla por
  bitácora. Caracterizado en `test_t33`.

## 3. Verificación (cifras del Verificador, sonda independiente)

Checklist de la spec: **11 de 12 cumplidos**. Orden: build primero, suite
dos veces en serie, grep, sonda, capturas.

| Item | Estado | Evidencia |
|---|---|---|
| Cliente con 1 contrato de 4.173.919 | cumplido | `/metricas`: ingreso 4173919.0, promedio 4173919.0, proveedor crudo "Lacteos Andes ventas@andes.com.co tel 300 555 8899" → "Lacteos Andes [correo oculto] tel [teléfono oculto]". Consolidado 7673919.0 = 4.173.919 + 2.000.000 + 1.500.000 = Σ publicados. |
| `/tendencia` sin null por umbral | cumplido | 2026-09 → 4173919.0 / 4173919.0, `sin_dato: false`; consolidada 7673919.0. |
| Spread con 1 contrato | cumplido | −16.5 con tarifa 5.000.000 (a mano: (4.173.919/5.000.000 − 1)×100 = −16,52). |
| grep vacío | cumplido | exit 1, dos veces. |
| Reporte del dueño: 200/401/403 | cumplido | Dueño 200; sin token 401; dueño de "dos" con `X-Cliente: uno` → 200 pero recibe SU reporte (slug de la membresía); operador sin membresía 401 (A1); legado sin `sub` 403. Membresía no-owner 403 (`test_t12`). |
| Contenido y aislamiento | cumplido | 22 entradas de catálogo, 12 meses, `canon_total` 4173919.0, `contratos_activos` 1, `version_vigente`/`version_aceptada` "2026-09-v2". Barrido de fugas sobre todas las hojas del JSON: cero rastros de "Super Dos", "Super Tres", "Colanta", "Ramo", correos ajenos. |
| Reporte del operador + bitácora | cumplido | 200, mismo shape; slug inexistente 404; `meses=99` 422. Accesos 3 → 4 con `{fecha: "2026-09-05", operador: "op-f7@recabra.co", accion: "reporte", periodo: "uno:2025-10..2026-09"}`. Fechas sin hora. Visible en `reporte-oscuro.png`. |
| Re-consentimiento | cumplido | Filas en v1 → `pedir_consentimiento: true`; `/aceptar-politica` 204; relogin limpio; reporte con `aceptada_en: "2026-09-05"`. Legado admin 200 sin consentimiento. |
| Política byte-idéntica | cumplido | `cmp` sin diferencias. |
| Capturas | cumplido | `outputs/capturas/`: `consola-claro-sin-supresion.png` (HTML sin "Suprimido" ni "‹3"; Don Pepe con 0 contratos → `—` y $ 0), `reporte-claro.png`, `reporte-oscuro.png`, `reporte-impresion.png` (fondo rgb(255,255,255), tinta rgb(20,24,28), controles ocultos). Único error de consola: fonts.googleapis.com bloqueado por el sandbox. |
| `tsc` y `build` | cumplido | `tsc --noEmit` exit 0; `build` exit 0, 11.10 s, 2217 módulos; único aviso el chunk >500 kB preexistente. |
| Ningún test borrado "porque molesta" | cumplido | Conteo por archivo contra `origin/main` idéntico en los 7 reescritos; `test_f09` único borrado, con comentario. |
| **Suite verde dos veces en serie** | **PENDIENTE** | 876 tests: 868 passed, 7 xfailed, **1 failed**, idéntico en las dos corridas. |

## 4. Conflictos abiertos

Entre agentes: **ninguno**. Bloqueantes para cerrar: **uno**.

**B-1 — `test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint`
rojo.** El test enumera el OpenAPI y barre TODA ruta GET fuera de
`/api/montaje` con el token de montaje, exigiendo 401. Rellena los parámetros
de ruta con un diccionario `relleno` (líneas 129-134) que tiene `sede`,
`space_code`, `code`, `space_id`, `lease_id`, `file_id`, `supplier_id`, `id`,
`svg_id`, `key`, `arte_id` — pero no `slug`. Hasta hoy ninguna ruta GET
llevaba `{slug}` (`/api/plataforma/clientes/{slug}` era sólo PATCH).
`GET /api/plataforma/clientes/{slug}/reporte` es la primera, y salta el assert
"falta con qué rellenar …: quedaría sin barrer". Nadie del equipo lo vio
porque nadie corrió la suite completa (consigna: sólo el Verificador la
corre, y la corrió). Arreglo: una clave más en `relleno` con un slug del
fixture. Efecto colateral mientras esté rojo: la ruta nueva no está barrida;
casi seguro da 401 (`require_operador` sin email ni `sub`), pero no está
probado.

**Menores, no bloquean** (para el mismo commit de cierre o el siguiente):

- a) `backend/app/plataforma_reporte.py:91`: comentario dice "sin la
  supresión de celda chica que sí aplica `/tendencia`". `/tendencia` ya no
  suprime nada. Borrar la frase.
- b) `backend/app/plataforma_metricas.py:904`: "(≥ K contratos con tarifa)"
  describe el comportamiento viejo; el párrafo lo aclara después, pero
  confunde. Reescribir como "(hasta la Fase 6, ≥ K contratos con tarifa)".
- c) `docs/ESTADO.md:707`: dice "Los 8 archivos de test" y lista 9
  (incluye `test_metricas_ataques`). Corregir a 9 — los 9 están
  efectivamente modificados.
- d) L-4 (legal, baja): la entrada `estado_cuenta` del catálogo dice "con el
  motivo del último cambio"; conviene "el motivo que escribió el operador",
  para que el cliente no lea que se le tomó un dato suyo.

## 5. Texto para `docs/ESTADO.md`

Los dos bloques **ya están escritos en el árbol** (backend-supresion y
backend-reporte los actualizaron en el mismo cambio, como manda CLAUDE.md):
la enmienda re-enmendada en `docs/ESTADO.md:242-257` y la sección
"Fase 7 — Transparencia" en `:683-786`, más `frontera-5` marcado como
resuelto en `:641-655` y `VERSION_POLITICA` corregida en `:181` (L-5
cerrado). Se reproducen para revisión, con dos retoques marcados que van en
el commit de cierre.

### 5.1 Enmienda de la regla dura del operador (reemplaza la de Fase 4)

> **Enmienda de la regla del operador, RE-ENMENDADA en Fase 7**: el operador
> ve los **agregados EXACTOS de todos los clientes, sin umbral** — con un
> contrato activo, el ingreso del mes es ese contrato y así se publica. Hasta
> la Fase 6 esto se protegía con una supresión de celda chica (K=3: por
> debajo de 3 contratos activos, el dato salía `null`); el dueño de la
> plataforma decidió cambiar el trato en vez de parcharlo (la auditoría
> integral encontró que la regla era porosa, `frontera-5`, resuelto abajo).
> La contrapartida es el **reporte de transparencia** (Fase 7, más abajo):
> cada cliente puede pedir, a demanda, qué dato exacto tomó la plataforma de
> él, cómo lo calculó y quién del operador lo consultó. Lo que sigue intacto:
> el JSON de métricas jamás contiene filas de negocio, valores de contrato
> individuales, ni correos/nombres de usuarios finales — solo números y el
> top-5 de proveedores (nombre + conteo, saneado). Ningún otro endpoint de
> plataforma abre una base de cliente. Un cliente suspendido también aparece
> en métricas (el operador necesita ver el negocio completo).

Sin cambios respecto de lo que está en el árbol.

### 5.2 Sección "Fase 7 — Transparencia"

El texto de `:683-786` queda como está (Parte A / Parte B con shape JSON /
Parte C), con estos dos retoques:

**Retoque 1** (`:707`): "Los 8 archivos de test que afirmaban la supresión"
→ "Los 9 archivos de test que afirmaban la supresión".

**Retoque 2** — agregar al final de la sección, antes de "Pendientes
conocidos":

> **Verificación de cierre (2026-09-05).** Sonda independiente sobre base
> propia: cliente con 1 contrato de 4.173.919 y tarifa punta 5.000.000 →
> `/metricas` publica ingreso 4173919.0, promedio 4173919.0, spread −16.5,
> proveedor saneado; consolidado 7673919.0 = Σ de los tres clientes
> legibles; `/tendencia` idéntico y `sin_dato: false`. Reporte del dueño:
> 22 entradas de catálogo, 12 meses, cero rastros de otros clientes; del
> operador: mismo shape y línea `accion="reporte"` en la bitácora que el
> reporte siguiente del dueño lista. Re-consentimiento verificado de punta a
> punta; legado intacto. `tsc` y `build` limpios. Capturas en
> `features/transparencia/outputs/capturas/`.
>
> **Gotcha para quien agregue un GET con parámetro de ruta**:
> `test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint` barre
> el OpenAPI entero con el token de montaje y necesita un valor para cada
> parámetro en su diccionario `relleno`. `GET /api/plataforma/clientes/{slug}/
> reporte` fue el primer GET con `{slug}` y lo rompió; `slug` ya está en el
> diccionario. Un parámetro nuevo sin relleno hace fallar la suite entera a
> propósito.

## 6. Qué le queda al humano

### 6.1 Cierre técnico (hoy, 10 minutos)

1. `backend/tests/test_montaje_enlace.py:129`: agregar `"slug": "<slug del
   fixture _armado>"` a `relleno`.
2. Retoques a), b), c), d) de la sección 4 y los dos retoques de ESTADO.
3. Suite completa dos veces en serie (borrando `*.db` entre medio, sin
   paralelizar por archivo — A5: las bases hermanas `recabra_<slug>.db`
   chocan con TMPDIR compartido).
4. Commit y PR a `main`. Render despliega solo desde `main`: el deploy
   dispara el re-consentimiento para TODOS los usuarios con cuenta en el
   próximo login — coordinar con 6.3 antes de mergear.

### 6.2 Abogado — la política v2

La política nueva (§5.3, 10 marcadores `[VALIDAR CON ABOGADO]`) cambia el
trato de forma material. Lo que legal-compliance le deja, en orden de
urgencia:

1. **Agregado sobre un solo contrato.** Si un agregado calculado sobre UN
   contrato, visible para el operador con la trazabilidad completa del
   reporte como contrapartida, es compatible con la finalidad informada y con
   el contrato de encargo del §5.2. Instrucción explícita en el documento: si
   la respuesta es no, el camino es **restringir la lectura del operador, no
   ampliar el reporte**.
2. **Relación canon / tarifa sin umbral.** La tarifa es dato de negocio de
   un tercero, no dato personal; pero con `contratos_sin_tarifa == 0` se
   despeja del spread con 0,03 % de error (A2). Confirmar si basta con
   cubrirla en el contrato de servicio del §5.2 o si hay que degradar la
   precisión del spread.
3. **Nombre comercial de un proveedor unipersonal**: más urgente ahora
   porque ya no hay agrupación mínima que sirva de disociación. Sale saneado
   (correo/teléfono enmascarados) pero el nombre puede ser el de una persona
   natural.
4. **Fecha de último acceso / días sin acceso** de un cliente con una sola
   cuenta activa: atribuible a esa persona.
5. **Nueva**: el **día de aceptación de la política** que el reporte muestra
   al operador — en un supermercado con un solo dueño es atribuible a él.
6. §7.1(c): el freno del reporte es compartido con `/mi-export` (L-3). El
   texto dice "un límite de pedidos por hora" y es veraz; confirmar que no
   hace falta decir que es compartido.

Los marcadores `[COMPLETAR]` heredados (contacto, encargado) siguen abiertos.

### 6.3 Comunicación a los clientes del cambio de trato

El re-consentimiento técnico (modal al entrar, "aceptar la política nueva")
es el mecanismo, no la comunicación. Un dueño de supermercado que ve un modal
sin aviso previo va a aceptar sin leer o va a llamar. Antes de mergear a
`main`:

- **Aviso previo** (correo o llamada a cada cliente activo, fecha estimada de
  deploy): la plataforma deja de omitir cifras cuando hay pocos contratos; a
  cambio, desde su panel puede generar cuando quiera el reporte de
  transparencia con cada dato tomado, cómo se calculó y quién lo miró.
  Enlace a la política v2 con el párrafo "Qué cambió respecto de la versión
  anterior" de §5.3 (ya está escrito en lenguaje llano; sirve tal cual).
- **Qué NO cambia**, dicho explícitamente: el operador sigue sin ver
  contratos, espacios, notas, fotos, correos ni nombres de usuarios; los
  nombres de proveedores siguen saneados; la tarifa de referencia sigue sin
  mostrarse.
- **Cómo ejercer los derechos**: reporte (`/reporte-plataforma`), export
  completo, supresión, y a quién escribir (el contacto `[COMPLETAR]` de la
  política tiene que estar lleno antes de este correo).
- **Qué pasa si no acepta**: hoy el modal bloquea el acceso hasta aceptar.
  Decidir si a un cliente que no quiere el trato nuevo se le ofrece algo
  (baja, export y cierre) y quién lo atiende.
- **Al operador**: los reportes que genere quedan en la bitácora y son
  visibles para el cliente; cada consulta de la consola también. Que lo sepa
  antes de que un cliente le pregunte por una línea de acceso.

## Archivos de referencia

- Spec: `/tmp/retail-espacios-test/features/transparencia/spec.md`
- Entregables por agente: `/tmp/retail-espacios-test/features/transparencia/outputs/{backend-supresion,backend-reporte,frontend,legal-compliance,auditor-frontera}.md`
- Capturas: `/tmp/retail-espacios-test/features/transparencia/outputs/capturas/`
- Test rojo: `/tmp/retail-espacios-test/backend/tests/test_montaje_enlace.py:129-160`
- Política: `/tmp/retail-espacios-test/docs/legal/politica-datos.md` (§5.3 en 298-360, §11 en 700-720)
- ESTADO: `/tmp/retail-espacios-test/docs/ESTADO.md` (:181, :242-257, :641-655, :683-786)
