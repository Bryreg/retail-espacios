# Auditoría de preparación para producción y comercialización — RECABRA · cierre de las 5 tandas

**Fecha:** 2026-10-30 · **Estado auditado:** `main` en `e072c64` (después de los PR #112 a #116) · **Entorno:** contenedor de desarrollo, sin acceso a producción.

Este documento responde al mismo pedido que `docs/auditoria-pre-lanzamiento-recabra.md` (el informe original, que **no se modificó**, salvo la marca de P2-3 como riesgo aceptado), pero sobre el código **después** de corregir los hallazgos en cinco tandas. Por cada hallazgo dice qué se hizo, dónde está, cómo se comprobó y qué falta.

**Restricciones que se respetaron:** no se desplegó nada a producción ni se tocó su base; no se escribió en `backend/retail_espacios.db`; las pruebas usaron bases temporales (SQLite en `/dev/shm`, un Postgres 16 local descartable y el Postgres de servicio de CI). Ningún `[COMPLETAR]` legal se rellenó: quedan para el abogado. El plan de Render sigue gratuito hasta el lanzamiento comercial, por decisión del dueño.

---

## 0. Veredicto

**El software quedó listo para el lanzamiento. Lo que todavía bloquea vender no es código: es lo legal (el abogado) y cuatro configuraciones que sólo hace el dueño (Render, GitHub, Firebase y el simulacro de restauración).**

| Prioridad | Hallazgos | Resueltos | Parciales | Pendientes | Aceptados por el dueño |
|---|---|---|---|---|---|
| **P0** | 4 | 1 | 2 | 1 | — |
| **P1** | 19 | 19 | — | — | — |
| **P2** | 24 | 17 | 5 | 1 | 1 |
| **P3** | 16 | 16 | — | — | — |
| **Total** | **63** | **53** | **7** | **2** | **1** |

- **P0 que siguen abiertos:** P0-2 (lo legal, en manos del abogado: el producto ya registra la aceptación versionada y la tiene apagada hasta que el texto sea definitivo), P0-3 (los respaldos existen y se probaron de ida y vuelta, falta el simulacro contra la base real) y P0-4 (plan pago de Render, que el dueño activa justo antes de vender).
- **Parciales P2:** P2-5 (sin ETag/304), P2-6 (los archivos siguen en la base, con alerta de cuota), P2-16 (deshacer no es atómico en el servidor, pero ya no miente), P2-20 (el Inicio bajó de 550 a 312 kB, la meta era 250 kB) y P2-24 (las pruebas de texto se reemplazaron sólo en lo tocado).
- **Pendiente P2:** P2-4 (la base de GALERÍAS es también la del registro): no entró en ninguna tanda.
- **Aceptado:** P2-3 — la caché del navegador sigue guardando los planos con montos. Decisión del dueño: «para acceder a esa información debe entrar desde la computadora desde la cual accede y esto ya es responsabilidad del usuario».

No hizo falta reconstruir ningún módulo (§8).

---

## 1. Alcance y método

- **Qué se auditó:** el código real de `backend/`, `frontend/`, `.github/workflows/`, `render.yaml`, `Dockerfile` y `docs/legal/`, en `main` después de las cinco tandas. Cada «resuelto» de este documento apunta a un archivo y a una prueba que lo demuestra; ninguno se da por hecho porque aparezca en la pantalla.
- **Cómo se trabajó:** cada tanda en su rama, integrada sobre la anterior, verificada en local (pytest completo, `tsc`, `npm run probar`, `npm run build` y, desde la tanda 4, E2E) y luego en CI. Se mergeó sólo con CI en verde.
- **Qué cambió respecto de la versión anterior (el informe original, en `cbe9438`):**

| PR | Tanda | Hallazgos |
|---|---|---|
| [#112](https://github.com/Bryreg/retail-espacios/pull/112) | 1 · Seguridad | P0-1, P1-10 a P1-13, P2-1, P2-2, P2-3 (aceptado), P2-23 (logs), P3-1 a P3-4, P3-15, P3-16 |
| [#113](https://github.com/Bryreg/retail-espacios/pull/113) | 2 · Datos e indicadores | P1-15 a P1-18, P2-11 a P2-14, P2-16, P2-17, P2-18, P3-5 a P3-8, P3-11 |
| [#114](https://github.com/Bryreg/retail-espacios/pull/114) | 3 · Operación y despliegue | P0-3, P1-1 a P1-9, P2-5 a P2-10, P3-10, P3-12, P3-13 |
| [#115](https://github.com/Bryreg/retail-espacios/pull/115) | 4 · Pantalla, accesibilidad y E2E | P1-19, P2-15, P2-19 a P2-22, P2-24, P3-9, P3-14 |
| [#116](https://github.com/Bryreg/retail-espacios/pull/116) | 5 · Privacidad y políticas | P0-2 (parte de producto), P1-14, P2-23 (retención) |

---

## 2. Resultados de las pruebas

| Prueba | Antes (informe original) | Ahora | Evidencia |
|---|---|---|---|
| `pytest` completo | 1 762 pasan; 6 carreras de Postgres **saltadas** | **Verde en CI, con Postgres 16** (`-n auto --dist loadgroup`); en local, 1 906 pasan y 0 fallan en la corrida de la tanda 5 | 126 archivos de prueba (antes 110). CI falla si se salta alguna prueba de Postgres (`deploy.yml`, «Postgres descartable»). |
| Pruebas de Postgres | No corrían | Corren en CI y en local contra un Postgres 16 | Sacaron a la luz 3 fallas que en SQLite no existían (§9). |
| `npx tsc --noEmit` | ✅ | ✅ | — |
| `npm run probar` | ✅ 49 suites | ✅ 50 suites (suma `probar-canon` y `probar-pantalla`) | La parte de navegador de `probar-graficos`, que antes se salteaba, ahora corre. |
| `npm run build` | `Dashboard` 1 068 kB (336 kB gzip) | `Dashboard` 25 kB gzip; Inicio por recorrido 312 kB gzip (antes 550) | `npm run medir:chunks` (tanda 4). |
| E2E (Playwright) | ❌ no había | ✅ **16 recorridos en CI** (job «E2E · recorridos y accesibilidad», en cada PR) | `frontend/e2e/`: entrar/salir, vender, editar, cancelar, distribuir, montar por enlace, worker sin montos, 5 de recuperación y 4 de axe. |
| axe-core | Violaciones serias en todas las pantallas | **0 serias o críticas** en 10 pantallas, claro y oscuro | `frontend/e2e/accesibilidad.e2e.ts`, en CI. |
| `npm audit --omit=dev` | 4 moderadas | **0** | react-router 7.18.5; `uuid` 11.1.1 por `overrides`. |
| `pip-audit` | ✅ | ✅ | — |
| Path traversal en la SPA | ❌ CONFIRMADO | ✅ cerrado | `tests/test_spa_sin_traversal.py` (11 casos de ataque y rutas legítimas). |
| Respaldo de ida y vuelta | No existía | ✅ en CI | `tests/test_respaldo_plataforma.py` (`pg_dump`/`pg_restore` reales). |

**Una falla que no se pudo explicar:** en una corrida local de la suite E2E, la revisión axe de la portada en tema oscuro falló una vez; corrida sola pasó, y en las dos corridas completas siguientes y en CI también. Queda anotada como **no reproducida** (§10).

---

## 3. Bloqueantes de lanzamiento (P0)

### P0-1 · Lectura de archivos del servidor por la ruta de la SPA — **RESUELTO**
- **Qué se hizo:** `backend/app/main.py`, `archivo_de_la_spa(dist, ruta)` sirve sólo un archivo que esté **directamente** en la raíz de `dist/` (rechaza `/`, `\`, `.`, `..`, vacío y enlaces simbólicos que salgan); todo lo demás es `index.html`.
- **Evidencia:** `tests/test_spa_sin_traversal.py`: 9 caminos de ataque (codificados, dobles, con `%2F`, enlaces) devuelven `index.html` y nunca código ni la base.
- **Criterio de aceptación:** `GET /..%2Fbackend%2Fapp%2Fauth.py` y similares no devuelven nada fuera de `dist/`. ✅ Cumplido.

### P0-2 · Lo legal es un borrador y no hay términos del servicio — **PARCIAL (falta el abogado)**
- **Qué se hizo (lo que es de producto):**
  - Política de datos **2026-10-v3**, revisada contra el sistema real (encargados, datos que faltaban, lo que guarda el navegador, plazos, derechos, seguridad). Corrige dos contradicciones con el sistema. Al desplegar, cada persona vuelve a aceptarla en su próximo ingreso (no bloquea).
  - **Términos del servicio** completos como borrador (`docs/legal/borradores/terminos-servicio.md`, servido por `backend/app/legal/terminos-servicio.md`).
  - **Aceptación versionada en el alta**, tabla `aceptaciones_de_terminos` (versión de términos y de política, supermercado, fecha, IP, origen). **Apagada** hasta `TERMINOS_VIGENTES=<versión>` y un texto sin marcas de borrador.
  - Anexo para el abogado: `docs/legal/revision-2026-10-30.md`.
- **Evidencia:** `tests/test_terminos.py` (9).
- **Lo que falta (no es código):** completar los `[COMPLETAR]` (Responsable, NIT, domicilio, contacto, precios, plazos, encargados por región), validar con el abogado, publicar los términos y prender `TERMINOS_VIGENTES`.
- **Criterio de aceptación:** la política identifica al Responsable y los términos se aceptan con versión en el alta. ⏳ El mecanismo está; el texto depende del abogado.

### P0-3 · Sin recuperación ante desastres — **PARCIAL (falta el simulacro)**
- **Qué se hizo:**
  - `.github/workflows/respaldo.yml`, todas las noches: `pg_dump -Fc` del registro y de cada base de cliente (y las `recabra_*` huérfanas), cifrado `gpg` AES256, artefacto de 14 días y copia opcional a S3/R2. Sin los secrets, se saltea con un aviso.
  - `backend/scripts/respaldar_plataforma.py` y `restaurar_plataforma.py`: la plataforma entera o un cliente (`--solo`/`--como`), sha256, `--ensayo`, no pisa sin `--reemplazar`.
  - Runbook en `docs/operacion.md` (restaurar todo, un cliente, RPO/RTO, lista del simulacro).
- **Evidencia:** `tests/test_respaldo_plataforma.py` hace una ida y vuelta real en CI.
- **Actualización:** la base de producción no acepta conexiones de afuera (y así queda), así que el respaldo se toma **desde adentro del servicio** (`POST /api/interno/respaldo`, `services/respaldo_interno.py`) y GitHub sólo guarda el archivo cifrado. La base está en plan pago y Render suma su propia recuperación de 3 días (PITR).
- **Lo que falta:** `MANTENIMIENTO_TOKEN` (GitHub y Render) y `RESPALDO_PASSPHRASE` (Render), correr el simulacro contra la base real y anotar el RTO en `docs/ESTADO.md`.
- **Criterio de aceptación:** existe un respaldo automático cifrado y una restauración ensayada con tiempo medido. ⏳ Lo primero sí; el ensayo real, no.

### P0-4 · El plan de Render — **PENDIENTE (decisión del dueño)**
- Sigue en el plan gratuito; el dueño lo pasa a pago justo antes de comercializar («antes no tiene sentido sin clientes»).
- Mientras tanto: `render.yaml` quedó con `autoDeployTrigger: checksPass`, el mantenimiento ya no depende de un proceso despierto (cron de GitHub, P1-5) y las migraciones corren al arrancar porque el `preDeployCommand` es sólo de planes pagos (queda comentado para prenderlo).
- **Criterio de aceptación:** plan pago activo antes del primer cliente. ⏳ Pendiente a propósito.

---

## 4. Estado por hallazgo

Leyenda: ✅ resuelto · 🟡 parcial · ⏳ pendiente · 🤝 aceptado por el dueño.

### 4.1 P1

| ID | Hallazgo | Estado | Qué se hizo y dónde | Evidencia |
|---|---|---|---|---|
| P1-1 | El despliegue no espera al CI | ✅ | `render.yaml`: `autoDeployTrigger: checksPass`. Verificado contra la documentación del Blueprint de Render. | Falta que el dueño lo confirme en el panel (el servicio se creó a mano). |
| P1-2 | Sin staging | ✅ (inactivo) | `render.staging.yaml`: Blueprint aparte, `plan: free`, rama `staging`. | Flujo en `docs/operacion.md` §10. |
| P1-3 | Observabilidad casi nula | ✅ | `app/observabilidad.py`: logging JSON a INFO; Sentry con `SENTRY_DSN`; `/api/health/ready` (`SELECT 1`, 503 si falla). Logs sin correos. | `tests/test_operacion.py`. |
| P1-4 | Correos sin reintento | ✅ | Tabla `correos_pendientes` por cliente; reintentos 5 min → 24 h, «abandonado» al 7.º; WARNING por falla y por no-2xx del proveedor. | `tests/test_cola_de_correos.py`. |
| P1-5 | Tareas programadas dentro del proceso web | ✅ | `POST /api/interno/mantenimiento` (token con `hmac.compare_digest`; 404 sin `MANTENIMIENTO_TOKEN`) + `.github/workflows/mantenimiento.yml` cada 3 h + candado de líder (`services/lider.py`, `pg_try_advisory_lock`). | `tests/test_operacion.py` (el candado en Postgres). |
| P1-6 | Un cliente caído impide arrancar a todos | ✅ | Cada cliente se prepara en su propio `try`; el que falla queda degradado (503 claro) y el mantenimiento lo reintenta. | `tests/test_operacion.py`. |
| P1-7 | Sin `pool_pre_ping` en el motor por defecto | ✅ | `pool_pre_ping`/`pool_recycle`; caché de `buscar()` de 10 s que se vacía con los eventos del ORM. | — |
| P1-8 | Sin migraciones | ✅ | Alembic **sólo aditivo** (`backend/migraciones/`: línea base + índices de contratos), corre al arrancar con advisory lock. | `tests/test_migraciones.py` rechaza drop, rename, alter y NOT NULL sin default; `test_t22` exige migración para una columna nueva. |
| P1-9 | CI no prueba en Postgres | ✅ | `postgres:16` en el job de backend; el job falla si se saltea una prueba de Postgres; cliente 16 fijo en el PATH. | CI verde con las carreras de doble venta corriendo. |
| P1-10 | `JWT_SECRET` por defecto | ✅ | `app/auth.py`: fuera de `ENV`/`APP_ENV` = dev/test, el arranque falla sin `JWT_SECRET`; con menos de 32 bytes, avisa. | `tests/test_jwt_secret_obligatorio.py`. |
| P1-11 | La clave compartida abre todos los clientes | ✅ | El login legado se siembra y se acepta sólo en el supermercado de siempre (`LOGIN_LEGADO_TODOS=1` para el comportamiento viejo). | `tests/test_login_legado.py`. |
| P1-12 | Alta self-service sin tope | ✅ | `ALTAS_POR_DIA` (10 por defecto); lo que pasa el tope va a `altas_en_espera`, contesta 429 «en espera» y avisa a `OPERADOR_EMAILS`. | `tests/test_alta_tope_diario.py`. |
| P1-13 | Operador sin segundo factor | ✅ | El token de consola lleva `mfa` si Firebase dice `sign_in_second_factor`; con `OPERADOR_EXIGE_MFA=1`, 403 sin él. El correo del operador salió de los archivos del repo (sigue en el historial de git). | `tests/test_operador_mfa.py`. |
| P1-14 | Derechos de los titulares a mano | ✅ | `services/titulares.py`: exporta y anonimiza a una persona en todas las bases (conserva contratos, bitácora y facturación anonimizados). Rutas de operador por POST; «Descargar mis datos» por persona; tabla `derechos_de_titulares` con huella, nunca el correo; procedimiento con plazos de 10 y 15 días hábiles en `docs/operacion.md` §11. | `tests/test_titulares.py` (13). |
| P1-15 | Repisas del 3D como venta paralela | ✅ | `PUT /layout/{sede}` responde 409 `repisas_vendidas`; nuevo `POST /layout/{sede}/repisas/{fixture}/{slot}/contrato` pasa por Vender (`confirmar_lote`: candados, choques, participaciones, bitácora). Panel de sólo lectura con «Pasar a contrato» y «Liberar la repisa». | `tests/test_repisas_del_3d.py`. |
| P1-16 | Canon del mes de dos formas | ✅ | Una sola definición: `services/canon.py` y su gemela `utils/canon.ts`, con los mismos casos (`scripts/casos/canon.json`). Fuera `/dashboard/kpis` y `/dashboard/spaces`. | `tests/test_canon.py` y `probar-canon`. |
| P1-17 | Métricas de plataforma pierden vencidos | ✅ | Misma regla que la serie (`historial.tramo_devengado`), sin filtrar por `is_active`. | Prueba de un mes pasado que concilia contra una suma a mano. |
| P1-18 | La planilla no deja rastro | ✅ | `contrato.alta` por contrato, en la misma transacción. | `tests/test_planilla_bitacora.py`. |
| P1-19 | Sin red de seguridad ni E2E | ✅ | `components/ErrorDeApp.tsx` (límite de app y de módulo, «Recargar»); recarga una sola vez ante `vite:preloadError` (marca en `sessionStorage`); 16 recorridos E2E en CI. | Job «E2E · recorridos y accesibilidad». |

### 4.2 P2

| ID | Hallazgo | Estado | Qué se hizo y dónde | Evidencia |
|---|---|---|---|---|
| P2-1 | JWT de sesión en `?token=` | ✅ | Token de medios: `POST /api/auth/token-medios`, 15 min, `uso: "medios"`, no abre ninguna otra ruta; el navegador lo renueva (`frontend/src/api/medios.ts`). La sesión por query ya no entra. | `tests/test_token_medios.py`. |
| P2-2 | Sin logout en el servidor | ✅ | `jti` en cada token; `POST /api/auth/logout` lo anota en `sesiones_cerradas` y lo rechaza (también su token de medios). | `tests/test_token_medios.py`. |
| P2-3 | Planos con montos en `localStorage` | 🤝 | Se probó guardar la caché sin montos y el dueño prefirió dejarla como estaba. Anotado en ESTADO, en el informe original y en la política (§2.7 y §10.1). | — |
| P2-4 | GALERÍAS es también la base del registro | ⏳ | No entró en ninguna tanda. La herramienta de traspaso ya existe. | Criterio original: `_db_por_defecto()` no coincide con el `db_name` de ningún cliente. |
| P2-5 | Carga del sondeo | 🟡 | Sin sondeo con la pestaña oculta; `/layout/revisions` sin parsear el JSON; `/spaces/comercial` sólo contratos vivos con `selectinload`; GZip desde 1 KB. **Falta ETag/304.** | La meta de p95 < 200 ms con 20 pestañas no se midió. |
| P2-6 | Archivos como blobs en Postgres | 🟡 | WARNING al 70 % de `CUOTA_BASE_MB` y `GET /api/plataforma/salud`. **Los archivos siguen en la base**; prender `LIMPIAR_FOTOS_VENCIDAS` está documentado. | — |
| P2-7 | Layout de 2 MiB como tope | ✅ | WARNING con la sede y el tamaño al pasar la mitad del tope. | — |
| P2-8 | Pasos manuales al desplegar | ✅ | El chequeo de `buscar_codigos_pc` corre en cada mantenimiento; no queda paso manual por despliegue. | — |
| P2-9 | Build no reproducible | ✅ | `npm ci --legacy-peer-deps` en el `Dockerfile`; el compose exige `JWT_SECRET`. | — |
| P2-10 | Sin `statement_timeout` | ✅ | 30 s (`STATEMENT_TIMEOUT_S`) en los motores de Postgres. | Prueba con `pg_sleep(3)` cancelado en CI. |
| P2-11 | El servidor no exige pesos enteros | ✅ | `schemas/pesos.py` redondea con `al_peso` en todos los esquemas de dinero. | `tests/test_pesos_enteros.py`. |
| P2-12 | Rutas viejas con otra semántica | ✅ | Fuera `/spaces/map`, `/spaces/by-svg`, `POST /spaces/`, `PUT /suppliers/{id}`, `/mounts/files/{id}/exists`. `POST /spaces/{id}/leases` se queda (27 archivos de prueba lo usan) y ahora guarda forma «total» y pesos enteros. | — |
| P2-13 | Cancelar borra la historia | ✅ | Tabla `bajas_de_contrato`: lo cancelado devenga hasta el día anterior a la baja. | `test_un_contrato_cancelado_devenga_hasta_su_baja`. |
| P2-14 | Escrituras sin bitácora | ✅ | Usuarios, tarifas, temporadas, sedes, proveedores, planometría, avisos, contactos, catálogo y `plano.guardado`. | `tests/test_bitacora_en_toda_escritura.py` recorre todas las rutas de administración. |
| P2-15 | Errores mostrados como «nada pendiente» | ✅ | «No se pudo leer … · Reintentar» en Pendientes, `MountView` y tarifas (`tarifasSinLeer`). | `probar-pantalla`. |
| P2-16 | Editar con cambio de partes no es atómico | 🟡 | `deshacer` dice si el plano volvió; si no, la pantalla lo avisa en vez de «No se guardó nada». **Sigue sin ser atómico en el servidor.** | `probar-comercial`. |
| P2-17 | En tarifas gana la última escritura | ✅ | `PUT /layout/rates` con `base_updated_at` → 409 `rates_conflict`; la pantalla relee y avisa. | — |
| P2-18 | Borrar una sede es irreversible | ✅ | Papelera de 30 días (`sedes_en_papelera`) con «Restaurar» en Ajustes › Sedes. No devuelve reservas provisionales canceladas (podrían pisar una venta nueva). | `tests/test_papelera_de_sedes.py`. |
| P2-19 | El 3D sin WebGL | ✅ | `StoreEditor3D/SinLienzo.tsx`: explica la causa (sin WebGL, contexto perdido) y ofrece el 2D. | — |
| P2-20 | Bundle pesado | 🟡 | `lazy()` por módulo, `xlsx` sólo por `import()`. Inicio 550 → 312 kB gzip. **Meta < 250 kB no alcanzada.** | `npm run medir:chunks`. |
| P2-21 | Accesibilidad | ✅ | `<main>`/`<h1>`, contrastes, progressbar con nombre, SVG de la landing como grupo. | axe en CI: 0 serias o críticas en 10 pantallas. |
| P2-22 | Dependencias con avisos | ✅ | react-router 7.18.5; `uuid` por `overrides`. | `npm audit --omit=dev` = 0. |
| P2-23 | Huecos de privacidad en el producto | ✅ | Logs sin correos (`resumen_de_destinatarios`, `sin_correos`); el log de accesos tacha el `?t=` de los enlaces; retención definida y aplicada (§5). | `tests/test_retencion.py` (7). |
| P2-24 | Pruebas sobre el texto del código | 🟡 | `probar-pantalla.mjs` (15 pruebas de comportamiento) y guardas ajustadas en lo tocado. El resto de la suite sigue igual. | — |

### 4.3 P3

| ID | Hallazgo | Estado | Qué se hizo y dónde |
|---|---|---|---|
| P3-1 | `/docs` y `/openapi.json` públicos | ✅ | Sólo en desarrollo (`main.py`); probado en un proceso con `ENV=produccion`. |
| P3-2 | Enlaces no revocables | ✅ | `jti` en los enlaces de montaje y guía; Ajustes › Equipo › *Cortar un enlace* (`POST /api/auth/revocar-enlace`, deja línea en la bitácora). Los enlaces de antes vencen solos. |
| P3-3 | Estado de seguridad en memoria | ✅ | Regla dura «Un solo proceso» en `docs/ESTADO.md`. |
| P3-4 | Freno de fuerza bruta sólo por IP | ✅ | 50 fallos en 15 min por supermercado sumando IPs (`LOGIN_MAX_TOTAL`). La protección de Firebase la activa el dueño. |
| P3-5 | Montos con «M» | ✅ | Fuera `platM`; el eje de los gráficos se ensancha con el monto completo. |
| P3-6 | Código muerto de totales | ✅ | Fuera de `DashboardView`. |
| P3-7 | Marca y correo reales en la plantilla | ✅ | «Proveedor de ejemplo» / `compras@ejemplo.com`. |
| P3-8 | Fecha del navegador vs. Colombia | ✅ | El mes del canon es el `hoy` del servidor. |
| P3-9 | `keepalive` > 64 kB | ✅ | `utils/guardadoAlCerrar.ts`: manda lo que entra; lo demás queda `dirty`, pide confirmación y sube al volver. |
| P3-10 | Auditoría de dependencias sólo en PR | ✅ | También los lunes. |
| P3-11 | N+1 en `planogramas.resumen` | ✅ | Una consulta. |
| P3-12 | pytest no paralelizable | ✅ | Carpeta propia por prueba; `pytest-xdist` en CI. |
| P3-13 | `JWT_SECRET` documentado de dos formas | ✅ | `sync: false` en producción, igual que ESTADO. |
| P3-14 | Falta `og:image` | ✅ | `public/og-recabra.png` (1200×630) y `twitter:image`. |
| P3-15 | El worker ve `notify_emails` | ✅ | Le llega vacío. |
| P3-16 | Redacción con lista negra | ✅ | `negotiatedValue` se quita a cualquier profundidad del JSON (`layout._sin_plata`). |

---

## 5. Evaluación por área (lo pedido, punto por punto)

1. **Funcionalidad de todas las pestañas.** Siguen completas. Ahora hay 16 recorridos E2E que las ejercitan en cada PR contra el backend real (entrar, vender, editar, cancelar, distribuir, montar, worker sin montos, recuperación). Nuevas: «Cortar un enlace» (Ajustes › Equipo), papelera de sedes (Ajustes › Sedes), «Derechos de una persona» (consola), «Descargar mis datos» (menú de la cuenta), panel de repisa de sólo lectura con «Pasar a contrato».
2. **Persistencia, base de datos y recuperación.** Migraciones aditivas con Alembic, respaldo nocturno cifrado con restauración por cliente, cola de correos persistente, papelera de sedes, `statement_timeout`, `pool_pre_ping`, arranque degradado por cliente. **Pendiente:** el simulacro real (P0-3) y separar GALERÍAS del registro (P2-4).
3. **Seguridad, autenticación, autorización y separación de clientes.** Cerrado el path traversal; sesión fuera de las URLs; logout real; enlaces revocables; `JWT_SECRET` obligatorio; clave compartida confinada; MFA opcional para el operador; tope de altas; freno por supermercado. La separación por base y el cliente firmado en el token siguen como estaban, y las pruebas de ataque cruzado pasan.
4. **Integridad comercial e indicadores.** Un solo canon (gemelo navegador/servidor con casos compartidos), métricas de plataforma con la misma regla, bajas con fecha efectiva, pesos enteros en el servidor, bitácora en toda escritura de administración, conflicto optimista en tarifas.
5. **Editor 3D y ocupación.** Las repisas ya no son una venta paralela: lo comercial pasa siempre por Vender. El 3D explica cuándo no puede dibujar y ofrece el 2D. La ocupación sigue saliendo de los términos vivos.
6. **Pruebas automatizadas y E2E.** Postgres en CI, xdist, E2E con Playwright y axe en CI. Al correr Postgres aparecieron 3 fallas que SQLite escondía; se corrigieron (§9).
7. **Compilación, dependencias y rendimiento.** `tsc` y build limpios; 0 avisos de producción; carga inicial −43 %. **Parcial:** la meta de 250 kB (P2-20) y ETag (P2-5).
8. **Producción, despliegue y recuperación.** Deploy después del CI, staging listo (inactivo), healthcheck de disponibilidad, logs estructurados y Sentry opcional, mantenimiento por cron con líder, runbook. **Pendiente (dueño):** configurar Render, los secrets y el simulacro.
9. **Privacidad, accesibilidad y SEO.** Política v3 y términos completos como borrador (los `[COMPLETAR]` son del abogado), retención aplicada, derechos de los titulares con herramienta, logs sin datos personales. Accesibilidad: 0 serias/críticas en axe. SEO: `og:image` y `twitter:image`.
10. **Requisitos pendientes para vender como SaaS.** Ver §6.

---

## 6. Qué bloquea el lanzamiento y qué puede esperar

**Bloquea (hay que hacerlo antes del primer cliente pago):**
1. **Abogado (P0-2):** completar los `[COMPLETAR]` de la política y los términos con `docs/legal/revision-2026-10-30.md`; copiar el texto final sobre `backend/app/legal/terminos-servicio.md`; desplegar y poner `TERMINOS_VIGENTES` en Render.
2. **Plan pago de Render (P0-4)** y, con él, descomentar `preDeployCommand` en `render.yaml`.
3. **Respaldos (P0-3):** `MANTENIMIENTO_TOKEN` en GitHub y en Render, `RESPALDO_PASSPHRASE` en Render (guardada también en un gestor de contraseñas) y el simulacro de `docs/operacion.md` §5 con el RTO anotado.
4. **Configuración que el código ya espera:**
   - Render: `JWT_SECRET` de 64 caracteres al azar, `MANTENIMIENTO_TOKEN` (igual que en GitHub), `OPERADOR_EMAILS`, `ALTAS_POR_DIA`, `CUOTA_BASE_MB=1024`; Auto-Deploy «After CI Checks Pass»; Health Check Path `/api/health/ready`.
   - GitHub: protección de `main` con los checks obligatorios.
   - Firebase: MFA para el operador y después `OPERADOR_EXIGE_MFA=1`; protección contra enumeración y App Check.

**Puede esperar:**
- P2-4 (separar GALERÍAS del registro), P2-5 (ETag), P2-6 (almacenamiento de objetos), P2-16 (deshacer atómico), P2-20 (partir `DashboardView` y decidir si la landing sale del pedazo de entrada, que choca con la Fase 9), P2-24 (seguir cambiando pruebas de texto por pruebas de comportamiento).
- Sacar el correo del operador del historial de git (exige reescribir la historia).
- **Comercialización fuera de Colombia:** moneda por supermercado, zona horaria, idioma, ley de datos por país y facturación. Queda como dibujo para aprobar (no es parte de esta auditoría).

---

## 7. Para el dueño, en orden

1. Reunión con el abogado (`docs/legal/revision-2026-10-30.md`).
2. Render: variables de §6.4, Auto-Deploy y Health Check.
3. GitHub: secrets de respaldo y mantenimiento; protección de `main`.
4. Firebase: MFA, enumeración, App Check; después `OPERADOR_EXIGE_MFA=1`.
5. Simulacro de restauración y RTO en ESTADO.
6. Repisas del 3D con proveedor cargado: resolver cada una desde su panel («Pasar a contrato» o «Liberar la repisa»).
7. Al pasar a plan pago: `preDeployCommand` y `CUOTA_BASE_MB`.
8. Por cada persona anonimizada: borrar su cuenta en Firebase. Si se restaura un respaldo anterior a una supresión, volver a aplicarla.

---

## 8. ¿Hace falta reconstruir algún módulo?

**No.** Todo se corrigió sobre el código existente, sin perder funcionalidades:
- Las repisas del 3D no se eliminaron: lo que tenían se puede pasar a contrato o liberar desde su panel.
- Las rutas viejas que se borraron no tenían ningún uso en el frontend; la que usan las pruebas (`POST /spaces/{id}/leases`) se conservó con la semántica nueva.
- El único candidato a partir es `DashboardView.tsx` (≈8 700 líneas), por rendimiento (P2-20): partirlo por modo, no reescribirlo.

---

## 9. Lo que apareció al corregir (no estaba en el informe original)

- **Pruebas que sólo fallaban en Postgres.** Al sumar Postgres a CI aparecieron 3 fallas:
  - la carrera de doble venta llamaba a `confirmar` con la firma vieja (la tanda 2 le sumó `request`);
  - el `pg_restore` del runner era más nuevo que el servidor 16 y volcaba `SET transaction_timeout` (se fijó el cliente 16 en CI y `restaurar_plataforma.py` acepta `PG_RESTORE`);
  - `test_fotos_vencidas` competía con la vuelta de mantenimiento del arranque.
- **Gráficos de la consola:** con la plata completa (P3-5), los rótulos del eje se salían del svg. No se veía porque la parte de navegador de `probar-graficos` se salteaba sin Playwright. El margen ahora crece con el rótulo.
- **CI:** `ubuntu-latest` ya es 26.04 y Playwright 1.56 no instala Chromium ahí: el job E2E quedó en `ubuntu-24.04`.
- **E2E frágiles:** dos selectores encontraban dos elementos (el contenedor del 3D y el panel de Distribuir; dos formularios de Vender). Se ataron a un solo elemento.
- **Cortar un enlace sin bitácora:** lo detectó la prueba nueva de P2-14; corregido.

---

## 10. Lo que no se pudo comprobar

- **Nada de producción:** el plan real de Render, sus variables, la región, el tamaño de la base, el estado de Firebase y el Auto-Deploy se verifican en sus paneles.
- **El simulacro de restauración** contra la base real (P0-3).
- **Rendimiento con carga real:** p95 con 20 pestañas y 2 000 contratos (P2-5), más de 500 muebles en el 3D, y el LCP en un teléfono real.
- **La falla de axe no reproducida** en la portada en tema oscuro (§2): una vez en local, nunca en CI.
- **La validez legal** de la política y los términos: es del abogado.
- **El envío real de correos** (proveedor, entregabilidad): las pruebas usan un proveedor falso.
