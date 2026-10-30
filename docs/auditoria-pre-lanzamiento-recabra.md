# Auditoría de preparación para producción y comercialización — RECABRA

**Fecha:** 2026-10-30 · **Rama auditada:** `claude/vibrant-wozniak-1ny6q4`, igual a `main` después del PR #111 (commit `cbe9438`) · **Entorno:** contenedor de desarrollo, sin acceso a producción.

**Restricciones que se respetaron:** no se desplegó nada; no se tocó producción; no se escribió en `backend/retail_espacios.db`. Los servidores locales usaron bases temporales en el scratchpad. Este archivo es el único que se agregó al repositorio.

---

## 0. Veredicto

**RECABRA no está lista para venderse como SaaS a clientes nuevos.** Hay **4 bloqueantes (P0)**: uno técnico de seguridad, uno legal, uno de recuperación ante desastres y una verificación de infraestructura que sólo se hace en el panel de Render. Los cuatro se resuelven en días, no en semanas. No hace falta reconstruir ningún módulo.

Lo que está bien:
- **El producto funciona.** Las pestañas están completas de punta a punta, sin llamadas a rutas inexistentes.
- **La doble venta está bloqueada en el servidor**, con candados en todos los caminos de escritura.
- **La ocupación sale de los contratos vivos**, no del dibujo.
- **El trabajador no recibe montos** desde el servidor.
- **Cada cliente tiene su propia base**, y el cliente va firmado dentro del token.
- **Hay muchas pruebas y pasan.**

Los riesgos están en la **operación**:
- respaldos;
- monitoreo;
- despliegue sin espera al CI;
- tareas programadas dentro del proceso web;
- correos que se pierden en silencio.

También hay **cuatro inconsistencias de datos** que un cliente puede notar:
- el canon del mes calculado de dos formas;
- las repisas del 3D que se venden por fuera de los contratos;
- las métricas de plataforma que pierden los contratos vencidos;
- la planilla que no deja rastro en la bitácora.

| Prioridad | Cantidad | Significado |
|---|---|---|
| **P0** | 4 | Bloquea el lanzamiento comercial. |
| **P1** | 19 | Antes de vender al segundo o tercer cliente, o en el primer mes. |
| **P2** | 24 | Próximo trimestre. |
| **P3** | 16 | Deseable. |

---

## 1. Alcance y método

- **Pruebas ejecutadas**, todas en el contenedor:
  - typecheck;
  - las 49 suites `npm run probar`;
  - build de producción;
  - la suite completa de `pytest`, en 4 tandas aisladas;
  - `npm audit`, prod y completo;
  - `pip-audit`;
  - axe-core sobre 8 pantallas, con servidor local y datos de prueba;
  - una prueba dirigida de path traversal contra un servidor local.
- **Lectura del código** en cuatro frentes, cada hallazgo con archivo y línea:
  - seguridad y privacidad;
  - persistencia, despliegue y recuperación;
  - funcionalidad e integridad de datos;
  - frontend, rendimiento, accesibilidad y SEO.
- **Verificación cruzada:** las afirmaciones más fuertes de cada frente las volví a comprobar en el código o ejecutándolas. Están marcadas **CONFIRMADO**.
- **Estados de cada hallazgo:**
  - **CONFIRMADO:** con evidencia de código o de ejecución.
  - **RIESGO:** plausible por el código, sin demostrar.
  - **NO VERIFICADO:** no se pudo comprobar desde aquí, y se dice por qué.

### 1.1 Qué cambió respecto de la versión anterior

La línea de base es la versión más vieja disponible en este clon superficial: el commit `41257c8` del 2026-09-02, cercano a la instantánea documental `docs/context/` del 2026-08-23. Desde ahí:

- **224 commits** (PR #34 a #111): 1 782 archivos tocados, +379 856 / −11 583 líneas.
  - `backend/app`: 88 archivos, +33 203.
  - `frontend/src`: 290 archivos, +101 887.
  - Pruebas: 171 archivos, +107 265.
- **Autenticación.** Antes había dos claves compartidas (`admin123`/`galerias`) guardadas en texto plano. Ahora:
  - cuentas nominales con Firebase y membresías owner/admin/worker;
  - contraseñas con Argon2id;
  - el login legado apagado por defecto;
  - revocación por «época» y por membresía.
- **Datos.** Antes había una sola base. Ahora:
  - **una base Postgres por supermercado**, con el registro de clientes en la base por defecto;
  - alta self-service, traspaso y baja;
  - modelo de «una sola verdad»: lo comercial vive sólo en la base y el layout lo descarta al guardar.
- **Respaldo.** `scripts/respaldo.py` se reemplazó por una copia ZIP que baja la dueña y por `restaurar_copia.py`.
- **Correo.** Pasó de Gmail SMTP a Brevo o SendGrid por HTTPS.
- **Nuevo desde entonces:**
  - candados advisory de Postgres;
  - hora del negocio en Colombia (`fechas.py`);
  - cobranza de la plataforma;
  - limpieza de fotos;
  - cabeceras de seguridad (CSP, HSTS, XFO) y tope de cuerpo;
  - auditoría de dependencias en CI;
  - consola de operador;
  - derechos del titular (export y solicitud de supresión);
  - consentimiento versionado;
  - en la última semana: planogramas, Distribuir unificado, Plano › Caras y la regla nueva de planometría.
- **Sigue igual:**
  - esquema sólo aditivo, sin herramienta de migraciones;
  - archivos como blobs en Postgres;
  - uvicorn con 1 worker;
  - token de 12 h en `localStorage`;
  - `render.yaml` no gobierna el servicio, que se creó a mano.

---

## 2. Resultados de las pruebas

| Prueba | Resultado | Evidencia y notas |
|---|---|---|
| `npx tsc --noEmit` | ✅ 0 errores (1 min 22 s) | — |
| `npm run probar` (49 suites) | ✅ 0 fallos; ≈1 475 comprobaciones | Se saltó 1 verificación con navegador (`vender · navegador`) porque necesita `PROBAR_VENDER_URL` y un token. |
| `npm run build` | ✅ (50 s), con advertencia de chunks > 500 kB | `Dashboard` 1 068 kB (336 kB gzip); `exceljs` 939 kB (271 kB); `three` 732 kB (190 kB); `StoreEditor3D` 481 kB (157 kB). `dist` pesa 4,9 MB. |
| `pytest` completo (110 archivos), en 4 tandas con un `TMPDIR` propio en `/dev/shm` | ✅ **1 762 pasaron, 0 fallaron, 0 errores**; 9 saltadas, 7 xfail (12 min) | Las 9 saltadas: 6 carreras de concurrencia que piden Postgres (`test_partes_concurrencia.py:169`, `test_participaciones_concurrencia.py:562-672`, ver P1-9) y 3 guardas de procedencia (`test_tendencia_ataques.py:886,934`, `test_landing_ataques.py:463`). Con `JWT_SECRET=ci-secret`, igual que en CI. |
| `pytest` en 6 tandas con el `/tmp` compartido | ❌ muchos fallos, **por las pruebas y no por el producto** | En pruebas, la base de cada cliente es `/tmp/recabra_<slug>.db` (`app/clientes.py:87-92`). Dos procesos se pisan el archivo y aparece `attempt to write a readonly database`. Con un `TMPDIR` por proceso no pasa (fila anterior). Ver P3-12. |
| `npm audit --omit=dev` | ⚠️ 4 moderadas, 0 altas | `react-router(-dom)`: open redirect; `uuid` vía `exceljs`. Los arreglos son cambios de versión mayor. |
| `npm audit` completo | ⚠️ 6 moderadas, 2 altas (sólo dev) | `vite` y `source-map-js`: herramientas de build y del servidor de desarrollo, no se publican. |
| `pip-audit -r requirements.txt` | ✅ sin vulnerabilidades conocidas | — |
| axe-core 4.10 (landing, política, Inicio, Contratos, Indicadores, Plano, Caras, Montajes) | ⚠️ 0 críticas; violaciones «serias» en todas las pantallas | Contraste de `.avatar-app` en las 6 internas; `nested-interactive` en el SVG de la landing; `aria-progressbar-name` en Inicio. Moderadas: falta `<main>` o `<h1>` en 5 pantallas, landmarks duplicados y contenido fuera de regiones. Ver P2-21. |
| Path traversal en el servidor local (`dist` recién compilado) | ❌ **CONFIRMADO** | Ver P0-1. |
| Cabeceras HTTP en `/` | ✅ CSP sin `unsafe-inline` en scripts, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` | HSTS sale sólo detrás de proxy (`main.py:404-431`), correcto. |
| Pruebas de extremo a extremo en CI | ❌ no existen | Las suites `probar-*` son unitarias o miran el código fuente (≈2 400 aserciones sobre el texto del código y ≈3 800 sobre valores). Los recorridos con Playwright existen como scripts de verificación manual (`probar-vender`, `probar-plataforma`, `probar-graficos`), pero CI no los corre. Ver P1-19. |

---

## 3. Bloqueantes de lanzamiento (P0)

### P0-1 · Cualquiera puede leer archivos del servidor a través de la ruta de la SPA — CONFIRMADO

- **Archivos:** `backend/app/main.py:514-524`.
  ```python
  file = _DIST / full_path
  if file.is_file():
      return FileResponse(file)
  ```
  No hay `resolve()` ni ninguna comprobación de que el archivo quede dentro de `frontend/dist`.
- **Evidencia (ejecutada en local, sin sesión):**
  - `GET /../../backend/app/main.py` y `GET /%2e%2e/%2e%2e/backend/app/main.py`, con `curl --path-as-is`, devuelven **200 con el código fuente** (30 711 bytes).
  - `GET /../../../../../../../../etc/hostname` devuelve 200 con el contenido.
  - La base SQLite de la propia prueba, pedida por ruta absoluta, devuelve **200 con los 765 952 bytes**.
  - `/proc/self/environ` sale vacío porque su tamaño en disco es 0: las variables de entorno no se filtran por este camino.
  - **NO VERIFICADO en producción:** no se probó contra el sitio en vivo. Si el proxy de Render normaliza o no `..` y `%2e%2e` no cambia la decisión, porque el defecto está en el código.
- **Qué expone en Render:** todo el código y los scripts, y cualquier archivo legible del contenedor (Secret Files en `/etc/secrets/*`, si se usan). En el despliegue VPS expondría además la base SQLite completa.
- **Por qué no se detectó:** `tests/test_landing_ataques.py` se salta los casos de la SPA cuando no existe `frontend/dist`, que es justo la situación del job de backend en CI.
- **Solución:** `p = (_DIST / full_path).resolve()`, y servirlo sólo si `p.is_relative_to(_DIST.resolve()) and p.is_file()`. Mejor todavía: servir únicamente `index.html` y una lista fija (`robots.txt`, `_redirects`, favicon). Agregar una prueba que arme un `dist` temporal, para que no dependa del build.
- **Criterio de aceptación:**
  - `GET /../x`, `/%2e%2e/...`, `//etc/passwd` y `/%2Fetc%2Fpasswd` devuelven `index.html` o 404, nunca el archivo.
  - La prueba corre en CI sin `skip`.

### P0-2 · Lo legal publicado es un borrador, y no hay términos del servicio — CONFIRMADO

- **Archivos:**
  - `frontend/src/legal/politica-datos.md`: 19 marcas `[COMPLETAR`/`BORRADOR` (razón social, NIT, domicilio, correo, teléfono, plazos de retención, canales ante la SIC, encargados). La página `/politica-datos` la muestra tal cual.
  - `frontend/src/pages/Landing/Landing.tsx:870-882`: la landing pública muestra `[COMPLETAR: precio]`, `[COMPLETAR: unidad…]` y `[COMPLETAR: correo de contacto]`.
  - `docs/legal/borradores/terminos-servicio.md`: borrador con 6 `[COMPLETAR]`. **No se presenta ni se acepta en ninguna pantalla.** Fuera de «Términos de esta pantalla» en la ayuda, no aparece «términos» en el frontend.
- **Por qué bloquea:** cada cliente acepta en `ModalConsentimiento` una política que no identifica al Responsable del tratamiento (Ley 1581 de 2012 y Decreto 1377 de 2013). Vender sin términos deja sin regular el pago, la mora, la suspensión (que el sistema ya aplica, con el 402), la responsabilidad y la terminación.
- **Solución:**
  - completar los datos y hacer la revisión del abogado;
  - subir `VERSION_POLITICA`, que vuelve a pedir el consentimiento;
  - publicar los términos y registrar su aceptación, con versión, en el alta;
  - hacer el registro en el RNBD (`docs/legal/guia-rnbd.md`);
  - poner el precio real en la landing.
- **Criterio de aceptación:**
  - `grep -rn "\[COMPLETAR" frontend/src` no devuelve nada, y una prueba en CI lo vigila;
  - el alta guarda la versión de política y de términos aceptada.

### P0-3 · No hay recuperación ante desastres: ni respaldo automático, ni copia del registro de clientes — CONFIRMADO

- **Archivos:**
  - `backend/app/services/copia.py:5`: «en plan gratuito, Render no hace respaldos».
  - `docs/ESTADO.md` (§«La copia de seguridad»): «esta copia es la única».
  - `backend/app/services/traspaso.py:52-61`: las tablas del registro (`clientes`, `usuarios`, `membresias`, `suscripciones`, `facturas_cobro`, `pagos_cobro`, `consentimientos`…) no entran en ninguna copia.
  - No hay `pg_dump` ni respaldo programado en todo el repositorio.
- **Riesgo:**
  - Si se pierde la instancia de Postgres, se pierden la lista de clientes, las cuentas, las membresías y la facturación de la plataforma.
  - El RPO de cada supermercado depende de que su dueña se acuerde de bajar el ZIP.
  - No hay un RTO definido.
  - Restaurar requiere la consola de Render (de pago) o un procedimiento local que no está documentado.
- **Lo que sí existe:** `restaurar_copia.py --cliente` sólo restaura sobre una base vacía, en una transacción, y reinicia las secuencias. Está probado de ida y vuelta en `tests/test_copia_de_seguridad.py`, incluso contra Postgres 16.
- **Solución:**
  - Postgres de pago con PITR;
  - `pg_dump` nocturno de **todas** las bases (por defecto + `recabra_*`) a almacenamiento externo (R2 o S3), desde un Cron Job de Render o una GitHub Action programada, con retención de 30 días;
  - un runbook de restauración, tanto de la plataforma entera como de un cliente suelto.
- **Criterio de aceptación:** RPO ≤ 24 h. Un simulacro documentado restaura el registro y un cliente en una instancia nueva, con el RTO medido y anotado en `docs/ESTADO.md`.

### P0-4 · El plan de Render no está verificado, y todo indica que es el gratuito — NO VERIFICADO (requiere el panel de Render)

- **Indicios:**
  - `render.yaml:68-69`: «el plan gratuito bloquea la salida SMTP».
  - `render.yaml` no declara `plan:` ni para la web ni para la base.
  - `docs/ESTADO.md` dice que la consola es «un plan pago» que no se tiene.
  - `docs/context/08-gotchas-pendientes.md`: el servicio se creó a mano, así que `render.yaml` puede no reflejar lo desplegado.
- **Si es el gratuito:**
  - la base gratuita de Render caduca y tiene un tope de 1 GB, con archivos guardados como blobs (ver P2-6);
  - la web se duerme sin tráfico, lo que trae arranques en frío y mantenimiento que sólo corre mientras está despierta;
  - no hay consola ni restauración en el servidor.
- **Solución:**
  - web en Starter o superior;
  - Postgres de pago (necesario además para P0-3);
  - fijar `plan:` en `render.yaml` y sincronizar el Blueprint, o documentar que no se usa.
- **Criterio de aceptación:** `docs/ESTADO.md` registra el plan de la web y de la base, y `render.yaml` coincide con lo desplegado.

---

## 4. P1 — Antes de vender a más clientes, o en el primer mes

| # | Hallazgo | Estado | Archivos y evidencia | Solución | Criterio de aceptación |
|---|---|---|---|---|---|
| P1-1 | El despliegue a producción no espera al CI | CONFIRMADO | `.github/workflows/deploy.yml:3-5`: «Render… builds from `main` on its own… nothing here triggers it». `render.yaml` no tiene `autoDeployTrigger`. pytest tarda unos 25 min, más que el despliegue. | Render: Auto-Deploy «After CI checks pass». GitHub: proteger `main` con checks obligatorios. | Un commit con pytest en rojo no llega a producción. |
| P1-2 | No hay ambiente de staging | CONFIRMADO | `render.yaml` define un solo servicio, sin `previews`. Un rollback de Render «revierte el código, no los datos». | Servicio y base de staging con una copia anonimizada. | Todo PR de backend pasa por staging antes de `main`. |
| P1-3 | Observabilidad casi nula | CONFIRMADO | No hay `logging.basicConfig`/`dictConfig` ni Sentry/APM (`main.py:184-188` lo admite: los INFO no salen nunca). `/api/health` (`main.py:501-503`) no consulta la base: con Postgres caído contesta 200. | Logging INFO en JSON; Sentry o similar; `/api/health/ready` con `SELECT 1`; monitor externo con alertas. | Un 500 provocado llega al tracker; con la base caída, el health check falla. |
| P1-4 | Los correos se mandan sin reintento y sus fallos no se registran | CONFIRMADO | `BackgroundTasks` en `bulk_leases.py:843,880`, `aviso_de_edicion.py`, `mounts.py`. `mailer.py:334` descarta el motivo del fallo; un no-2xx devuelve `False` sin log (`:224,260`). Un redeploy durante el envío lo pierde. Sólo los recordatorios dedupean (`NotificationLog`). | Tabla outbox por cliente (es tabla nueva, así que no rompe la regla «sin migraciones»); reintentos con backoff en el mantenimiento; WARNING en cada fallo. | Con la `EMAIL_API_KEY` revocada, el correo queda pendiente, se reintenta y deja una línea en el log. |
| P1-5 | Las tareas programadas corren dentro del proceso web | CONFIRMADO | `main.py:118,245-259`: un hilo cada 12 h hace vencimientos, recordatorios, purga, fotos, cierre de mes y cobranza. Si el servicio duerme no corre, y no hay candado de líder si un día hay varias instancias. | Cron Job de Render (o Action) que llame a un endpoint interno o a un script, con `pg_advisory_lock`. | Corre a hora fija sin tráfico, y una sola vez con N instancias. |
| P1-6 | Un cliente con su base caída impide arrancar a todos | CONFIRMADO | `main.py:273-285`: `create_all` y `ensure_default_config` para cada cliente, sin `try`. | Capturar el error por cliente, marcarlo como degradado y sacar el esquema a un paso de pre-deploy. | Con la base de un cliente borrada, la app arranca y los demás clientes responden. |
| P1-7 | El motor por defecto (registro + GALERÍAS) no tiene `pool_pre_ping` | CONFIRMADO | `database.py:14`: `create_engine(URL, connect_args=…)`. Los motores de cliente sí lo tienen (`clientes.py:126-133`). `buscar(slug)` consulta el registro en cada pedido, sin caché (`clientes.py:199-212`). | `pool_pre_ping=True`, `pool_recycle=1800`; caché con TTL para `buscar()`. | El primer pedido después de una noche sin uso no da 500. |
| P1-8 | No hay herramienta de migraciones, y son N bases | CONFIRMADO (decisión de diseño) | ESTADO §«Sin migraciones» + `test_t22`. `space_leases.space_id` no tiene índice (`models.py:81`). El dinero se guarda en `Float` (`models.py:86`). | Alembic con un runner por tenant y un `stamp` de la línea base, como `preDeployCommand`. | Una migración de prueba (el índice de `space_id`) se aplica a todas las bases y queda registrada. |
| P1-9 | CI no prueba en Postgres, que es donde viven los candados contra la doble venta | CONFIRMADO | `services/candado.py:44-50`: en SQLite no hace nada. `tests/test_partes_concurrencia.py:169` y `test_participaciones_concurrencia.py:471` se saltan sin `DATABASE_URL_PG_PRUEBA`. `deploy.yml` no tiene `services: postgres`. | Servicio `postgres:16` en el job de backend. | Las suites de concurrencia, copia y clientes se ejecutan (no se saltan) en cada PR. |
| P1-10 | El despliegue VPS arrancaría con `JWT_SECRET="dev-secret-change-me"` | CONFIRMADO (dormido) | `auth.py:43-49` sólo falla si existe `RENDER` o si la base es Postgres. `docker-compose.prod.yml` usa SQLite y no define `JWT_SECRET`. Si alguien pone `DEPLOY_TARGET=vps`, cualquiera puede firmar tokens de admin (y con P0-1, bajar la base). | Exigir `JWT_SECRET` de 32 bytes o más siempre, salvo con un `APP_ENV=dev` explícito; arreglar o borrar el compose. | Sin `JWT_SECRET`, o con uno corto, la app no arranca fuera de dev. |
| P1-11 | Con `LOGIN_LEGADO=1`, la misma clave de admin sirve en todos los clientes y deja nombrar dueños | CONFIRMADO (sólo con el legado prendido; hoy está apagado por defecto) | `auth.py:222-251` (`bootstrap_claves`) reparte `ADMIN_PASSWORD` a todos los clientes, y `render.yaml:64-67` lo admite. `usuarios.py:118-119`: `if rol_nuevo == "owner" and sub_actor is not None and not _actor_es_duenio(...)`: un token sin `sub` se saltea el chequeo, invita dueños y con eso obtiene la copia y el export de **cualquier** cliente. | Que un token sin `sub` reciba 403 en `/usuarios/*`; el legado por cliente, o eliminarlo. | Prueba: un token legado que hace `POST /usuarios/invitar {rol: owner}` recibe 403. |
| P1-12 | El alta self-service no tiene un tope global | CONFIRMADO | `alta.py:61`: máximo 2 por usuario; el freno por IP sólo cuenta fallos. Cada alta hace `CREATE DATABASE` y abre un pool de 2+3 conexiones (Postgres Basic admite unas 100, alrededor de 15 clientes según ESTADO). | Que el cliente nuevo quede «pendiente» hasta que lo apruebe el operador, o un tope diario más captcha; pools perezosos o pgbouncer. | N altas seguidas con cuentas distintas no crean más de X bases sin aprobación. |
| P1-13 | El operador de plataforma entra sin segundo factor, y su correo está en el repo | CONFIRMADO | `require_operador` sólo mira el correo en `OPERADOR_EMAILS`; no aparece `mfa`, `totp` ni `2fa`. Ese rol ve todos los clientes y puede borrarlos (`plataforma.py:676`). El correo aparece en `frontend/scripts/sembrar-plataforma.py:46`. | Exigir el MFA de Firebase (`sign_in_second_factor`) para `/api/plataforma/*`; sacar el correo del repo. | Un token de operador sin segundo factor recibe 403. |
| P1-14 | Los derechos de los titulares (Ley 1581) se atienden a mano y están incompletos | CONFIRMADO | `routers/derechos.py`: «la ejecución real es MANUAL». El export y la supresión son sólo para la dueña, y el export cubre 4 modelos. No hay endpoint que borre un `Usuario`. La retención de `bitacora_plataforma` está en `[COMPLETAR]`. | Un procedimiento documentado (plazo de 15 días hábiles) más un script o endpoint de operador que anonimice a un usuario o a un contacto de proveedor; «Descargar mis datos» por persona. | Una ruta probada exporta y suprime a una persona concreta, y queda en la bitácora. |
| P1-15 | Las repisas del 3D son una venta paralela sin contrato | CONFIRMADO | `StoreEditor3D.tsx:6418-6440`: proveedor, «Valor (COP/mes)» con `parseFloat(...)` y fechas en `fixture.slots`, guardados sólo en el JSON del layout. No crean `space_leases`, no pasan por `contratos_que_chocan` ni por el candado, no van a la bitácora y no cuentan en el canon ni en la ocupación. La planilla sólo avisa (`bulk_leases.py:503-520`). | Congelar la edición comercial de las repisas (dejar sólo «liberar») y pasarlas a contratos de parte o a reservas; o que `PUT /layout` responda 409 si hay una repisa ocupada en una cara con contrato vivo. | Ninguna pantalla escribe `supplierName`, `negotiatedValue` o `status` en una repisa nueva; pytest rechaza esa combinación con 409. |
| P1-16 | El «canon del mes» se calcula de dos formas | CONFIRMADO | Inicio, Mapa y Análisis usan `canonDelMes` del navegador, que suma el valor al mes **completo** de cada contrato vigente hoy (`DashboardView.tsx:6486-6495`). «Todas las sedes», la curva de 12 meses y la variación usan `/dashboard/serie`, que **prorratea por días** y devuelve decimales (`dashboard.py:229,250`; `DashboardView.tsx:7969-7990`). `/dashboard/kpis` es una tercera versión que nadie usa y cuenta por `Space.status`. | Una sola definición, con casos compartidos `frontend/scripts/casos/canon.json` que corran `probar-*` y pytest; borrar `/dashboard/kpis` y `/dashboard/spaces`. | Inicio y «Todas las sedes» muestran la misma cifra, fijada por la prueba gemela. |
| P1-17 | Las métricas de plataforma descartan los contratos vencidos por fecha | CONFIRMADO | `app/plataforma_metricas.py:467,501` filtran `SpaceLease.is_active == True`, y `_del_periodo` (`:529-540`) supone que eso significa «nadie lo canceló». Pero `expire_leases` (`routers/spaces.py:70-82`, que corre en cada lectura y en el mantenimiento, `main.py:172`) pone `is_active=False` a todo contrato con `end_date < hoy`. El mes en curso pierde los que terminaron en él, y el cierre de mes pierde casi todos los del mes cerrado. Las pruebas siembran contratos vencidos con `is_active=True` (`tests/test_plataforma_metricas.py:79`). No afecta la cobranza, que sólo limpia el caché. | Usar `historial.fue_canon` y `cerrados_a_mano`, como `/dashboard/serie`. | Prueba que corre `expire_leases` antes de calcular un mes pasado y concilia contra una suma a mano. |
| P1-18 | La planilla crea contratos sin dejar rastro en la bitácora | CONFIRMADO | `routers/bulk_leases.py`: 0 llamadas a `anotar`; `confirmar_lote` (`:677-741`) escribe y hace commit. Vender sí anota (`routers/vender.py:138,172`). | Anotar `contrato.alta` por cada contrato creado, en la misma transacción. | Después de `/leases/bulk/confirmar` hay N filas `contrato.alta`. |
| P1-19 | No hay una red de seguridad en la app, ni recuperación cuando falta un chunk viejo | CONFIRMADO | Hay error boundaries sólo en `StoreEditor3D.tsx:6723`, `ModoVender.tsx:1387` y la landing. Todo se carga con `lazy()` (`App.tsx:26-31`, `Dashboard.tsx:7-10`) y no se maneja `vite:preloadError`: una pestaña abierta antes de un deploy queda en blanco al cambiar de módulo. Un error de render en `DashboardView` (8 685 líneas) tumba la app entera. **Y no hay E2E en CI.** | Un error boundary de app con «Recargar»; recargar una vez ante `vite:preloadError`; 5–8 recorridos E2E con Playwright en CI (entrar, vender, editar, cancelar, distribuir, montar, worker sin montos). | Un error forzado muestra la pantalla de recuperación; el job E2E corre en cada PR. |

---

## 5. P2 — Próximo trimestre

| # | Hallazgo | Estado | Evidencia | Solución y criterio |
|---|---|---|---|---|
| P2-1 | El JWT de sesión (admin, 12 h) viaja en `?token=` y queda en los logs de acceso | CONFIRMADO | `frontend/src/api/files.ts:55`, `catalogo.ts:131`, `planograms.ts:79`, `guia.ts:120`; lo aceptan `auth.py:780` y `clientes.py:492`; uvicorn registra la query (`Dockerfile:56`). | Tokens de descarga de 60 s atados al archivo, o `fetch` → `blob:`. Ninguna URL que arma el frontend lleva el JWT. |
| P2-2 | No hay logout en el servidor: el token sigue valiendo hasta 12 h | CONFIRMADO | `authStore.ts:165,179`; no existe `/auth/logout`. | Revocar el `jti` en una tabla, o usar una cookie `HttpOnly; SameSite=Strict`. Después del logout, el mismo token recibe 401. |
| P2-3 | Los planos con montos del admin quedan en `localStorage` después del logout | RIESGO | `fixtureStore.ts:1589-1590` (`partialize` de `fixturesBySede`, con `negotiatedValue` de las repisas); el logout no lo borra. En un PC compartido, un worker podría verlo con F12. | Borrar `retail-fixtures-v1` en el logout, o no persistir montos. Criterio: después del logout no queda `negotiatedValue`. |
| P2-4 | La base de GALERÍAS es también la del registro de toda la plataforma | RIESGO | `clientes.py:111-116` (`motor_por_defecto`); la contención depende de listas (`traspaso.py:52-80`). | Mover GALERÍAS a `recabra_galerias` con el traspaso que ya existe. Criterio: `_db_por_defecto()` no coincide con el `db_name` de ningún cliente. |
| P2-5 | Carga del sondeo: cada pestaña consulta cada 20 s, con 1 worker | CONFIRMADO (código) / el impacto es RIESGO | `fixtureStore.ts:36` (20 s). `/layout/revisions` parsea el JSON completo de cada sede (`layout.py:631-637`). `/spaces/comercial` trae todo el historial con `joinedload`, escribe en un GET (`expire_leases`) y hace N+1 de proveedor. No hay GZip ni ETag. | Revisión sin parsear, `selectinload`, ETag/304, GZip, pausar el sondeo con la pestaña oculta. Criterio: p95 < 200 ms con 20 pestañas y 2 000 contratos. |
| P2-6 | Los archivos se guardan como blobs en Postgres, y la limpieza está apagada | CONFIRMADO | `LargeBinary` (`models.py:201,364,405`; `models/planogramas.py:177`); `files.py:277-278` sirve el archivo entero desde memoria; `LIMPIAR_FOTOS_VENCIDAS` apagada. | Almacenamiento de objetos con URL firmada, o al menos una alerta del tamaño de la base al 70 % y la limpieza encendida después de ensayarla. |
| P2-7 | Un layout no puede pasar de 2 MiB | RIESGO | `subidas.py:72` (`TOPE_JSON`); una sede grande recibiría 413. | Medir en producción y avisar al 50 % del tope. |
| P2-8 | Hay pasos manuales antes y después de desplegar | CONFIRMADO | `buscar_codigos_pc.py` «antes de desplegar»; ESTADO §«Lo que hay que hacer a mano después de desplegar»; no hay `preDeployCommand`. | Automatizar en el pre-deploy o en CI. |
| P2-9 | El build de producción no es reproducible | CONFIRMADO | `Dockerfile:9` usa `npm install --legacy-peer-deps`; CI usa `npm ci`. | Usar `npm ci --legacy-peer-deps` en el Dockerfile. |
| P2-10 | No hay `statement_timeout` ni timeout por pedido | RIESGO | No aparece en `app/`. Con 1 worker, una consulta lenta (la copia ZIP, las métricas de todas las bases) bloquea a todos. | `options=-c statement_timeout=…` en `connect_args`. |
| P2-11 | El servidor no exige pesos enteros | CONFIRMADO | `routers/vender.py:57,76` (`valor: float`), `schemas/spaces.py:48`, columnas `Float`; las tarifas y las repisas usan `parseFloat`. | Validar el entero o redondear con `al_peso` en todos los esquemas de dinero. Criterio: `1234.5` → 422 o 1235 en todos los caminos. |
| P2-12 | Hay rutas viejas expuestas con otra semántica | CONFIRMADO | `POST /spaces/{id}/leases` (`spaces.py:611-786`) crea contratos sin `CondicionesDeContrato`; `/dashboard/spaces` devuelve el total con nombre de mensual. Ninguna se llama desde el frontend. | Borrarlas o hacerlas pasar por `services/vender.py`. |
| P2-13 | Cancelar un contrato borra su historia en la serie | CONFIRMADO (decisión fijada por pruebas) | `dashboard.py:210` descarta los cancelados en todos los meses; no se guarda la fecha efectiva de la baja. | Guardar la fecha de baja (en una tabla nueva) y devengar hasta ese día. Criterio: un contrato de 6 meses cancelado en el mes 4 aporta 3 meses. |
| P2-14 | Varias escrituras no dejan rastro en la bitácora | CONFIRMADO | `PATCH /usuarios/{id}`, `POST /usuarios/invitar`, `PUT /layout/rates`, CRUD de `suppliers`, planometría, `PUT /notifications/*`. | Una prueba que recorra todas las rutas que modifican y exija bitácora. |
| P2-15 | Algunos errores se muestran como «no hay nada pendiente» | CONFIRMADO | `FaltaPlanometria.tsx:38`, `PlanogramasPorRevisar.tsx:42`, `PrecioSinForma.tsx:106`, `CobrosYReservas.tsx:137,287`, `MountView.tsx:162`, `DashboardView.tsx:4855,5684`; las tarifas quedan en «Cargando…» para siempre (`fixtureStore.ts:1285,1331`). | Distinguir «vacío» de «no se pudo leer», con aviso y botón de reintentar. |
| P2-16 | Editar un contrato con cambio de partes no es atómico | CONFIRMADO | `Contrato.tsx:938-975`: guarda el plano y después el contrato; el deshacer traga su propio error y dice «No se guardó nada». | Un solo endpoint, o avisar si el deshacer falla. |
| P2-17 | En las tarifas gana la última escritura | CONFIRMADO | `layout.py:899-910`: no controla la revisión, a diferencia del layout y los settings. | 409 optimista como en el layout. |
| P2-18 | Borrar una sede es irreversible | CONFIRMADO | `layout.py:1646-1648` (`db.delete(snap)`) y el cierre de los contratos vivos. | Papelera de 30 días, o exigir una copia previa. |
| P2-19 | El 3D no detecta si falta WebGL ni si se pierde el contexto | CONFIRMADO | Sólo la landing escucha `webglcontextlost`; el editor dice «Error en el editor 3D / Reintentar» sin explicar la causa. | Mensaje con la causa y un enlace al 2D. |
| P2-20 | Bundle pesado en el primer acceso de la app | CONFIRMADO | `Dashboard` pesa 1 068 kB (336 kB gzip). | Separar los módulos de `DashboardView` (8 685 líneas) en chunks por ruta y medir el LCP. Criterio: chunk inicial < 250 kB gzip. |
| P2-21 | Accesibilidad: violaciones «serias» de axe en todas las pantallas | CONFIRMADO | `.avatar-app` sin contraste suficiente (6 pantallas); `nested-interactive` en el SVG de la landing; `aria-progressbar-name` en `.ini-config-avance` (Inicio); faltan `<main>` o `<h1>` en 5 pantallas, hay landmarks duplicados y 5–121 nodos fuera de regiones. | Corregir y sumar axe a CI. Criterio: 0 violaciones serias o críticas en las 8 pantallas. |
| P2-22 | Las dependencias de producción tienen avisos moderados | CONFIRMADO | `react-router-dom@^6.23.1` (open redirect, sólo se arregla en la 7); `uuid` vía `exceljs`. | Planificar la migración a react-router 7 y revisar `exceljs`. |
| P2-23 | La política de privacidad tiene huecos en el producto | CONFIRMADO | Los correos de terceros quedan en los logs (`mailer.py:259,287,368`); la retención de la bitácora de plataforma está en `[COMPLETAR]`. | Registrar sólo la cantidad o el dominio; definir la retención. |
| P2-24 | Las pruebas son mayormente sobre el texto del código | CONFIRMADO | ≈2 400 aserciones `assert.match`/`includes` sobre el código fuente contra ≈3 800 sobre valores: un refactor sin cambio de comportamiento las rompe, y un cambio de comportamiento con el mismo texto no. | Al tocar un módulo, sustituir las aserciones de texto por pruebas de comportamiento (componentes o E2E). |

---

## 6. P3 — Deseable

| # | Hallazgo | Evidencia |
|---|---|---|
| P3-1 | `/docs` y `/openapi.json` son públicos | `main.py:311`: `FastAPI(title=..., lifespan=...)` sin `docs_url=None`. |
| P3-2 | Los enlaces de montaje y de guía (hasta 400 días) no se pueden revocar uno por uno | `auth.py:354-401`. |
| P3-3 | Hay estado de seguridad en memoria (cachés de membresía, de estado y de copia) que depende de un solo proceso | `auth.py:430`, `copia.py:41`. Documentarlo como regla dura antes de subir `--workers`. |
| P3-4 | El freno de fuerza bruta es sólo por IP | `routers/auth.py:54-83`. Activar en Firebase la protección contra enumeración y App Check (NO VERIFICADO: es configuración de la consola). |
| P3-5 | Hay montos abreviados con «M» en la consola de plataforma | `components/plataforma/formato.ts:83-87` (`platM`), usado en `graficos.tsx` y `DetalleCliente.tsx`. Contradice la regla de montos completos si también aplica al operador. Las pantallas del cliente están bien. |
| P3-6 | Queda código muerto que suma totales como si fueran mensuales | `DashboardView.tsx:6056-6092` (`kpis.revenue`, `committedRevenue`, `topSuppliers`). |
| P3-7 | La plantilla de la planilla usa una marca y un correo reales | `utils/planilla.ts:368-371` («Nutresa», `comercial@nutresa.com.co`). |
| P3-8 | `canonDelMes` usa la fecha del navegador y el servidor usa la de Colombia | `toISODate(new Date())` frente a `fechas.hoy()`. |
| P3-9 | El guardado al cerrar la pestaña con `fetch keepalive` falla por encima de 64 kB | `main.tsx:36`. Lo mitiga que `dirty` se guarda. |
| P3-10 | La auditoría de dependencias corre sólo en los PR | `.github/workflows/deps-audit.yml`: agregar `schedule:` semanal. |
| P3-11 | Hay N+1 menores | `services/planogramas.py:665` (`resumen`). |
| P3-12 | La suite de pytest no se puede paralelizar tal como está | Las bases de cliente en pruebas son `/tmp/recabra_<slug>.db` (`clientes.py:87-92`), y varios procesos que comparten `/tmp` se pisan. Con un `TMPDIR` por proceso funciona: en esta auditoría, 4 tandas tardaron 12 min contra unos 25 en serie en CI. Crear las bases bajo el `mkstemp` de cada prueba y habilitar `pytest -n`, o partir el job de CI en tandas con su propio `TMPDIR`. |
| P3-13 | La documentación de `JWT_SECRET` se contradice | `render.yaml` dice `generateValue: true`; ESTADO dice que es manual. |
| P3-14 | Falta `og:image` | `index.html` (pendiente anotado ahí mismo). |
| P3-15 | `GET /notifications/config` le muestra `notify_emails` al worker | Son correos internos, no montos. |
| P3-16 | `/layout` le quita los montos al worker con lista negra | `layout.py:131-145`. Es más robusto con lista blanca. |

---

## 7. Evaluación por área (lo pedido, punto por punto)

1. **Funcionalidad de todas las pestañas.**
   - Se cruzaron los 136 llamados HTTP del frontend contra las 164 rutas del backend: **ningún llamado apunta a una ruta inexistente**.
   - No hay botones sin acción, ni «próximamente», ni datos de ejemplo presentados como reales.
   - Completas: Inicio, Contratos (Vender, editar, cancelar, reservas, cobros), Montajes, Plano 2D, Plano › Caras, Mis muebles y taller (sólo comprobé que sus rutas existen y se llaman), Ajustes y Plataforma.
   - Parciales:
     - Indicadores (P1-16);
     - Planilla (P1-18);
     - 3D (visor completo; las repisas, P1-15);
     - Landing y Política (P0-2).
2. **Persistencia, base de datos y recuperación.**
   - Bien: una base por cliente; candados advisory; `FOR UPDATE` en cobranza y edición; 409 optimista en layout y settings; fechas con la hora de Colombia; archivos en la base y no en el disco efímero.
   - Por resolver: P0-3, P0-4, P1-6, P1-7 y P1-8.
3. **Seguridad, autenticación, autorización y separación de clientes.**
   - Se recorrieron los 27 routers con AST. **No hay ningún endpoint que modifique datos o sirva montos sin rol**, salvo los públicos a propósito.
   - El cliente sale sólo del JWT firmado; un slug desconocido da 401 y nunca cae a otro cliente.
   - Bien: Argon2id; tokens de Firebase verificados con RS256; invitaciones de un solo uso; tipo de archivo por extensión, sin SVG, y tope de tamaño; CSP estricta; no hay secretos commiteados.
   - Por resolver: **P0-1**, P1-10, P1-11, P1-12, P1-13, P2-1, P2-2 y P2-3.
4. **Integridad de los datos comerciales y consistencia de los indicadores.**
   - Bien: el servidor impide la doble venta (`contratos_que_chocan`, `revisar_capacidad`, candados con segunda revisión); Vender es todo o nada; la regla «al mes contra total» es gemela en navegador y servidor (`casos/meses.json`); el plano no guarda lo comercial.
   - Por resolver: P1-15, P1-16, P1-17, P1-18, P2-11 y P2-13.
5. **Editor 3D y ocupación.**
   - La ocupación sale de los términos vivos (`/spaces/comercial`, `/participaciones/ocupacion`), nunca del dibujo.
   - El desfase entre plano y base se cubre en las dos direcciones (`auditoriaDesfase.ts` y `/layout/importacion`).
   - Rendimiento razonable: `frameloop="demand"`, `dpr` acotado e `InstancedMesh`.
   - Por resolver: P1-15 y P2-19.
   - **NO VERIFICADO:** el comportamiento con más de 500 muebles.
6. **Pruebas automatizadas y E2E.**
   - Hay muchas y pasan (ver §2).
   - Faltan: E2E en CI (P1-19); Postgres en CI (P1-9); paralelización de pytest (P3-12); y conviene reducir las aserciones sobre el texto del código (P2-24).
7. **Compilación, dependencias y rendimiento.**
   - Compila sin errores.
   - Dependencias: 0 avisos altos en producción, 4 moderados.
   - Pendientes de rendimiento: el bundle inicial pesado (P2-20) y la carga del sondeo con 1 worker (P2-5).
8. **Configuración de producción, despliegue y recuperación.**
   - P0-3 y P0-4.
   - P1-1 a P1-5, P1-10.
   - P2-8, P2-9, P2-10.
9. **Privacidad, accesibilidad y SEO.**
   - Privacidad: **P0-2**, P1-14, P2-23.
   - Accesibilidad: P2-21.
   - SEO: título, descripción, OG y `robots.txt` están; falta `og:image` (P3-14). Se indexa `/` y `/politica-datos`, y se excluyen `/login`, `/plataforma` y `/api/`.
10. **Requisitos técnicos para comercializar como SaaS.**
    - Lo que falta:
      - legal: términos, política completa y RNBD;
      - respaldos con su prueba de restauración;
      - plan de pago;
      - monitoreo con alertas;
      - despliegue que espera al CI, y staging;
      - aprobación o tope del alta;
      - MFA del operador;
      - procedimiento de derechos del titular;
      - un SLA y una página de estado, que no existen;
      - definir el precio de la landing.
    - Ya existe: cobranza de la plataforma con suspensión (402), consola de operador, alta self-service, export y copia por cliente.

---

## 8. Qué bloquea el lanzamiento y qué puede esperar

**Bloquea (hacer antes del primer cliente pagando):**
1. P0-1, path traversal: un arreglo de pocas líneas más su prueba.
2. P0-2, lo legal: abogado, datos del Responsable, términos y precio.
3. P0-3, respaldos automáticos y un simulacro de restauración.
4. P0-4, confirmar o subir el plan de Render (requisito de P0-3).

**Debe estar en el primer mes, o antes del segundo cliente:**
- **Operación:** P1-1, P1-2, P1-3, P1-4 y P1-5.
- **Robustez multi-cliente:** P1-6, P1-7, P1-9 y P1-12.
- **Seguridad:** P1-11 y P1-13, y P1-10 si se activa el VPS.
- **Lo que el cliente nota:** P1-15, P1-16, P1-17, P1-18 y P1-19.
- **P1-8 (migraciones):** antes del próximo cambio de esquema que no sea aditivo.
- **P1-14:** antes de que llegue la primera solicitud de un titular.

**Puede esperar:** todo lo P2 y P3, priorizando P2-1 a P2-3 (sesión y montos en el navegador), P2-11 (pesos enteros) y P2-21 (accesibilidad).

## 9. ¿Hace falta reconstruir algún módulo?

**No.**

- Ningún hallazgo exige reescribir un módulo, y todos se corrigen de forma incremental, conservando la funcionalidad.
- Hay dos refactors acotados que vale la pena planificar, sin cambiar el comportamiento:
  - **`DashboardView.tsx` (8 685 líneas).** Partirlo por módulo (Inicio, Contratos, Indicadores) en archivos y chunks por ruta. Ayuda con P2-20 (bundle), P1-19 (aislar errores) y P2-24 (pruebas de comportamiento). Se hace por partes, cada una con sus pruebas actuales en verde.
  - **Las repisas (`slots`) del 3D.** No hay que reconstruir el editor: se saca la edición comercial de las repisas y se migran las repisas vendidas a contratos de parte o reservas con un script de importación, del estilo de `importar_del_plano.py`. Así se conserva lo vendido y se cierra la venta paralela (P1-15).

## 10. Lo que no se pudo comprobar

- **Producción:**
  - el plan real de Render y el tamaño de la base;
  - si el proxy de Render normaliza `..` o `%2e%2e` (P0-1);
  - la fuerza del `JWT_SECRET` cargado;
  - la configuración de Firebase (enumeración, App Check);
  - la protección de la rama `main` en GitHub.
- **Ejecución contra Postgres:** las pruebas de concurrencia se saltan sin `DATABASE_URL_PG_PRUEBA`.
- **El 3D con muchos muebles** y su comportamiento en dispositivos de gama baja.
- **Recorridos con navegador autenticado:** `vender · navegador` se saltó porque requiere un servidor propio y un token. La auditoría axe sí se hizo con sesión y datos locales.
- **El flujo completo de Mis muebles y taller:** sólo se verificó que sus rutas existen y se usan.
- **El correo real** (Brevo o SendGrid) y su entregabilidad.
