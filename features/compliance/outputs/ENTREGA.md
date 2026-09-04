# ENTREGA FINAL — Fase 3 Compliance (Ley 1581 + hardening OWASP)

**Maestro Orchestrator (Fable)** · 2026-09-04
Repo `/tmp/retail-espacios-test` · rama `claude/fase-3-compliance` (apilada sobre `claude/fase-2-clientes`) · HEAD `a85ef38` (solo la spec)

**Veredicto en una línea: la fase está técnicamente construida y verificada en vivo (442 passed × 2, tsc limpio), pero NO está entregada — todo el código vive sin commitear en el working tree y `docs/ESTADO.md` no se actualizó. Antes de tocar una línea más: commitear y actualizar ESTADO.md.**

---

## 1. Equipo y por qué

| Agente | Modelo | Por qué así |
|---|---|---|
| **legal** — Política Ley 1581 + guía RNBD | opus | Redacción legal-técnica colombiana de verdad (Ley 1581/2012, Decreto 1377/2013, guía operativa del RNBD): pide cuidado, no velocidad. Único agente con cero archivos de código. |
| **consentimiento** — aceptación en alta/invitación/login | sonnet | Frontera de ENTRADA: quién aceptó qué, cuándo, desde qué IP. Territorio: `auth.py`, `alta.py`, modelo nuevo, frontend de login/alta/modal. |
| **derechos** — export owner-only + solicitud de supresión | sonnet | Frontera de SALIDA: qué sale del sistema y qué jamás. Router NUEVO `derechos.py` + `plataforma.py`, territorio disjunto del anterior. |
| **hardening** — CSP medida, fix contrato-imagen (H8), CI de deps | sonnet | El reconocimiento cambió la misión: la CSP YA existía y YA estaba rota (bloqueaba el login de Fase 1) y el HSTS nunca se emitía detrás del proxy de Render. El trabajo fue medir y reparar, no agregar. |
| **red-team-exfiltracion** — auditor | opus | Todo lo nuevo de esta fase son canales de salida (export, página pública, headers, 428/429 como oráculos). Auditor de exfiltración, no de coherencia funcional. Escribió 39 tests de ataque (47 casos). |

Contratos fijados por el Maestro antes de largar (idénticos en las cinco misiones): `VERSION_POLITICA = "2026-09-v1"`; esquemas exactos de `consentimientos`, `solicitudes_supresion` y `export_attempts` (todas en el registro, `create_all()`, sin migraciones); owner-only = membresía leída del registro, NUNCA el rol del JWT (owner viaja como `admin` desde Fase 1); colisiones de archivo resueltas por contrato (`main.py` repartido por bloques; `politica-datos.md` del frontend con legal como dueño único).

---

## 2. Qué construyó / halló cada uno

### legal
- `docs/legal/politica-datos.md` (545 líneas) + copia **byte a byte idéntica** en `frontend/src/legal/politica-datos.md` (verificado con `cmp` y fijado por test `x21`) + `docs/legal/guia-rnbd.md` (314 líneas). Los tres abren con `> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.`
- Inventario real de datos personales sacado de leer los modelos (no de imaginación): registro y base por cliente, incluidas las fotos de montaje como riesgo de captación incidental de personas.
- **Corrigió un dato equivocado de la propia misión**: el umbral del RNBD es 100.000 UVT de activos totales (Decreto 090/2018), no 610.000 (eso fue el corte de plazos escalonados de 2018). Documentado adentro del texto con la explicación de la confusión (V1).
- Distinción transmisión/transferencia (art. 25 Dto. 1377) para Firebase y Render como encargados; "deber de seguridad del art. 17" en vez del "interés legítimo" del RGPD que no existe en la ley colombiana.
- 21 campos `[COMPLETAR]` y 13 `[VALIDAR CON ABOGADO]` marcados — ver sección 6.

### consentimiento
- Tabla `consentimientos` (`backend/app/models/consentimiento.py`): usuario, versión, fecha, IP, origen ∈ {alta, invitacion, login}, `UNIQUE(usuario_id, version)`.
- `POST /api/clientes/alta`: sin `acepta_politica=true` → **422 antes de cualquier escritura**; con él → fila en el mismo commit que la fundación. Encontró y arregló solo un bug propio: la segunda fundación del mismo usuario reventaba el UNIQUE con un 500 post-`crear_cliente()`.
- `POST /api/auth/oauth`: **428** `{codigo: "consentimiento_requerido"}` solo cuando hay membresía NUEVA por canjear y sin fila vigente — sin commit alguno (el rollback deshace hasta el `Usuario` a medio crear). Usuario existente con membresía → login pasa con `pedir_consentimiento: true` top-level (el JWT no cambia de forma). `POST /api/auth/aceptar-politica` → 204, idempotente por el UNIQUE. Login legado: ni un byte tocado.
- Frontend: página pública `/politica-datos` SIN login (resuelta antes del router, como el token de montaje), renderizador markdown propio (cero dependencias nuevas), checkbox obligatorio en el alta, modal de 428 en login, `ModalConsentimiento` post-login que avisa sin bloquear.
- **Causó y luego cerró B-1** (ronda 1): 21 tests de Fases 1-2 rotos por no propagar el 428 a los helpers de `test_identidad_ataques.py`/`test_estado_cuenta.py`. Fix de 5 líneas, todas en pasos de SETUP, ningún ataque desactivado (verificado línea por línea por el red-team).

### derechos
- `backend/app/routers/derechos.py` (NUEVO) con `require_owner()`: JWT con `sub` + membresía activa `rol == "owner"` leída con `sesion_registro()` — el rol del token no se mira en absoluto; el legado (sin `sub`) queda en 403 por construcción.
- `GET /api/clientes/mi-export`: JSON con exactamente `cliente/generado_en/version_politica/spaces/leases/suppliers/layouts`. **La exclusión de bitácora/hashes/intentos/estados es por construcción, no por lista negra**: el código simplemente nunca importa `AuditEntry` ni `AppConfig`. Freno 3/hora por `usuario_id` (tabla `export_attempts`) → 429; el 403 llega ANTES del contador, así que un no-owner no puede quemar la cuota del owner.
- `POST /api/clientes/solicitar-supresion` → 201; pendiente duplicada → 409. **Ningún DELETE en todo el archivo**: la ejecución es humana, a propósito.
- `GET/PATCH /api/plataforma/supresiones` (operador): nota obligatoria en el PATCH, constancia en la misma fila (mismo patrón que `estados_cliente` de Fase 2).
- Frontend: "Tus datos" en Configuración (export + solicitud) y "Solicitudes de supresión" en el panel de plataforma.
- **Declaró él mismo el gap m-3** (el 402 sobre habeas data — ver sección 5).

### hardening
- **CSP reparada por medición, no por fe**: grep sobre el bundle real de `@firebase/auth` instalado → los únicos hosts son `identitytoolkit.googleapis.com` y `securetoken.googleapis.com` (connect-src), más `apis.google.com` (script-src) y `https://*.firebaseapp.com` (frame-src) que el flujo de `signInWithPopup` exige siempre. Única concesión: `'unsafe-inline'` en `style-src` (React pinta con `style={{}}`), documentada en `main.py`; `script-src` limpio.
- **HSTS: bug de producción encontrado y arreglado** — `request.url.scheme` detrás del proxy de Render es siempre `http`, así que HSTS jamás se emitió en producción. Fix: `x-forwarded-proto == "https"` como señal positiva.
- **Fix H8 en dos iteraciones**: la Iteración 1 ("cara = imagen más reciente") fue tumbada por el red-team (B-2: el contrato como única imagen o subido después seguía bajando). Rediseño de Iteración 2: **designación explícita** — tabla nueva `space_faces` (una fila por espacio), campo `uso=cara` en el upload, y la MISMA fuente para el gate del worker (`files.py`) y la textura del 3D (`spaces.py::list_face_images`), que ya no pueden desacordar. En el camino corrigió también: M-1 (PDF con prefijo `montaje--` → content-type server-side), X-27 (hallazgo del auditor: rowid de SQLite reusado tras borrar la cara heredaba la designación — `delete_file` ahora limpia `space_faces` en la misma transacción) y un bug de HEIC que él mismo encontró (fotos de iPhone de mercaderistas hubieran desaparecido con el conjunto estricto de content-types).
- **Fail closed deliberado**: todo espacio anterior al deploy queda sin cara (3D sin textura, worker sin imagen) hasta que un admin la re-designe. No hay backfill a propósito: cualquier heurística de backfill es el defecto corregido, aplicado una vez.
- CI: `.github/workflows/deps-audit.yml` (`on: pull_request`; pip-audit con severidad vía OSV.dev — falla solo HIGH/CRITICAL — y `npm audit --omit=dev --audit-level=high`) + `.github/scripts/pip_audit_severity.py`, probado contra la API real de OSV.
- Revisión puntual: los 5 endpoints con `UploadFile` tienen límite explícito (10 MB el principal → 413); los 3 endpoints anónimos tienen freno por IP.

### red-team-exfiltracion
- `backend/tests/test_compliance_ataques.py`: 39 funciones, 47 casos. Atacó las cuatro puertas nuevas: export (reapuntar el cliente por query/header, `?token=`, freno como oráculo, IPs sembradas y buscadas en el JSON crudo), 428 como oráculo de correos/membresías (no lo es: 401 byte a byte idéntico), supresión (nadie ajeno la lee, nada se borra), headers/CSP/Referrer-Policy (los `?token=` no fugan por `Referer`), y el diseño nuevo de la cara (X-25…X-29: cuatro ataques, cuatro rebotes, uno real — X-27 — cerrado en la misma sesión).
- **Tumbó la Iteración 1 con evidencia** (B-1, B-2, M-1 en ronda 1) y certificó el cierre en ronda 2: suite completa **0 failed / 0 errors DOS veces**, barras de progreso byte a byte idénticas, hash del árbol invariante entre corridas.
- Dejó los hallazgos abiertos como `xfail(strict=True)`: se ponen rojos solos el día que alguien los arregle.

---

## 3. Coherencia (historial de rondas)

- **Ronda 1: `coherente: false`.** B-1 (21 tests de Fases 1-2 rotos por el gate 428, bloqueante), B-2 (fix H8 incompleto: la heurística de recencia no cerraba el escenario original, bloqueante), M-1 (prefijo `montaje--` como llave, advertencia).
- **Ronda 2: `coherente: true`, cero conflictos.** B-1 cerrado con 5 líneas quirúrgicas verificadas ataque por ataque; B-2 cerrado con el rediseño por designación explícita (X-18/X-18b/X-19 pasaron de xfail a tests positivos); M-1 cerrado para PDFs; X-27 (hallazgo nuevo del propio rediseño) también cerrado.
- Veredicto final del auditor: **coherente, sin conflictos bloqueantes**, con 8 pendientes menores declarados (m-1…m-8), ninguno de los cuales deja salir un dato por una puerta antes cerrada.

Nota de proceso: los builders trabajaron en paralelo sobre EL MISMO checkout, lo que generó ruido real (corridas de pytest pisándose los SQLite de `/tmp`, `readonly database` intermitente). Los tres agentes lo diagnosticaron correctamente como contención de infraestructura y las corridas certificadas se hicieron con `TMPDIR` aislado. Para la próxima fase: un worktree por builder.

---

## 4. Verificación (independiente del Maestro, sondas en vivo)

- **Suite: `442 passed, 7 xfailed` — DOS corridas idénticas, EXIT 0 ambas** (más una tercera de control). `tsc --noEmit` limpio; `npm run build` pasa (2213 módulos).
- **Sondas en vivo contra el servidor real** (verificador Firebase falso, base poblada): alta sin aceptar → 422 (también con el campo omitido); fila real de consentimiento leída con sqlite3 (versión, IP, origen); ciclo completo de `pedir_consentimiento` → aceptar → 204 → no vuelve a pedir; export: 401/403/403/200 según credencial, 4º pedido → 429, **JSON real inspeccionado**: cero coincidencias de bitácora/hash/password/IP sembrada; supresión: 201 → 409 → visible al operador → cero filas borradas; headers presentes en 200/401/402/404; HSTS solo con `X-Forwarded-Proto: https`; contrato JPG y PDF → 404 para worker por header Y por `?token=`, la cara designada → 200, `face-images` devuelve solo la designada.
- **Ojo con "suite verde"**: de los 7 xfailed, DOS (`test_x28`, `test_x19b`) son hallazgos de seguridad abiertos de ESTA fase, escritos en strict para que avisen al arreglarse. Verde significa "hallazgos inventariados", no "sin hallazgos".
- **CSP**: sin navegador en este entorno. Verificación estática sobre el bundle YA construido: cero scripts inline en `dist/index.html`, todos los hosts del bundle cubiertos por la CSP, salvo dos que no cubre: el sandbox del emulador (irrelevante en prod) y `https://www.google.com/recaptcha/api.js` — el código propio no usa reCAPTCHA, pero **si Firebase activa reCAPTCHA enforcement para correo/contraseña, `script-src` lo bloquea**. Queda para el humano (sección 6).

---

## 5. Conflictos y hallazgos que quedan abiertos

**Bloqueantes de la ENTREGA (proceso, no código):**

1. **Nada está commiteado.** HEAD = `a85ef38` (solo la spec). 26 archivos modificados + **22 archivos nuevos sin trackear (~7.000 líneas)**: los routers, los modelos, los 4 archivos de tests nuevos (75 tests), `docs/legal/`, el frontend nuevo y el workflow de CI. Consecuencias concretas: el `git diff --stat` miente (muestra 1.492 inserciones = ~18% de la fase), el CI de dependencias **no puede correr en ningún PR** porque su archivo no existe en ningún commit, y un `git clean -fd` borra la fase entera sin red.
2. **`docs/ESTADO.md` sin actualizar** — CLAUDE.md lo exige en el mismo PR. Ver sección 7 con el texto propuesto.

**El hallazgo que un abogado subrayaría (m-3, decisión de negocio pendiente):**

3. **El interruptor comercial de Fase 2 corta el habeas data.** Verificado en vivo: con el cliente `suspendido`, el owner recibe **402** en `mi-export`, `solicitar-supresion` Y `aceptar-politica` — este último es un callejón sin salida: el login le pide consentimiento y el endpoint para darlo contesta 402. Los derechos del titular (conocer, suprimir, autorizar) no son contingentes al pago según la Ley 1581. El builder hizo bien en no inventar la excepción (la spec no la pedía), pero **es bloqueante de la promesa comercial de la fase** ("vendible como conforme a la Ley 1581"). Fix probable: eximir esos tres endpoints del gate de estado.

**Deuda de seguridad declarada, con test que la fija (no bloqueante):**

4. **m-5 / `test_x28`** — una IMAGEN llamada `montaje--*.jpg` subida por un admin (jamás designada cara) baja con 200 para el worker y sin línea en bitácora (`files.py:91-102, :118, :260`). Requiere credencial de admin: canal de insider, acotado pero silencioso. Fix sugerido: prefijo completo `montaje--<code>--` verificado contra el espacio, o designación explícita también para montaje.
5. **m-6 / `test_x19b`** — el 404 al worker se levanta antes del `anotar`: numerar `/api/files/1..N` buscando contratos no deja rastro. ~3 líneas de fix (`archivo.denegado` antes del raise).
6. **m-7** — fail closed sobre la base instalada: post-deploy, un admin tiene que re-designar la cara de cada espacio existente (3D sin textura y worker sin imagen hasta entonces). Tarea operativa, no bug — pero hay que agendarla ANTES del deploy.
7. **m-1, m-2** (menores, de ronda 1, aceptados): carrera teórica SELECT+INSERT del consentimiento en altas concurrentes (variante de R-3/R-4); reactivar una membresía apagada no pasa por consentimiento (el aviso post-login avisa, no exige — decisión de la spec, pero sin prueba de autorización art. 7 Dto. 1377 para esa persona).

---

## 6. QUÉ LE QUEDA AL HUMANO

**Inmediato (sin esto no hay fase):**
1. **Commitear.** Los 22 untracked SON la fase. Sugerencia: un commit (o serie corta) en `claude/fase-3-compliance` + PR, que además es lo único que hace ejecutable el CI de dependencias y dispara su primer run real (hoy es configuración escrita, nunca observada corriendo).
2. **Actualizar `docs/ESTADO.md`** en el mismo PR (texto en sección 7).

**Legal (nada de esto lo puede resolver un agente):**
3. **Revisar la política con abogado.** 13 `[COMPLETAR]` (razón social, NIT, domicilio, canal de atención al titular, plazos de retención…) y 13 `[VALIDAR CON ABOGADO]` (V1–V13 listados en `features/compliance/outputs/legal.md`), en particular: V1 (umbral RNBD 100.000 UVT — la misión traía 610.000, corregido con fuentes), V5/V6 (transmisión internacional a Google/Render: ¿bastan sus términos estándar o hay que firmar anexo?), V2/V3 (imagen/menores captados incidentalmente en fotos de montaje). **No publicar `/politica-datos` con corchetes sin llenar** — el art. 13 del Dto. 1377 exige identificar al responsable; hoy la página mostraría los `[COMPLETAR]` a cualquiera.
4. **Decidir sobre el RNBD** con la guía (`docs/legal/guia-rnbd.md`): la obligación depende de activos totales > 100.000 UVT y naturaleza jurídica — datos de la empresa que solo el dueño tiene. La guía termina en tabla de decisión para llevarle al abogado; el mensaje central: no registrar no exime de casi ningún deber. Falta además el contrato de transmisión con los supermercados clientes (hoy no existe — brecha #7 del legal).
5. **Decidir m-3** (habeas data vs. interruptor de pago) — recomiendo tratarlo como bloqueante comercial y eximir los tres endpoints.

**Operativo:**
6. **Variables de entorno nuevas: NINGUNA.** Verificado: los archivos nuevos no leen `environ`; todo usa las `VITE_FIREBASE_*` y `OPERADOR_EMAILS` ya existentes. Nada que tocar en Render.
7. **Post-deploy: re-designar las caras** de todos los espacios existentes (m-7) — checkbox "Es la cara del mueble" en el panel de archivos de cada espacio. Sin eso, el 3D queda sin texturas y los workers sin imágenes. Avisar a producto ANTES de deployar.
8. **Smoke de navegador de la CSP**: abrir el frontend deployado, DevTools, login con Google por popup y login por correo, mirar la consola por violaciones de CSP. Es lo único que la medición estática no reemplaza. Si Firebase tiene reCAPTCHA enforcement activo para correo/contraseña, agregar `https://www.google.com/recaptcha/` a `script-src` (hoy lo bloquearía).
9. **Confirmar el primer run real de `deps-audit.yml`** en el PR de esta fase.

---

## 7. Actualización de `docs/ESTADO.md` — SÍ hace falta, texto propuesto

Agregar una sección "Fase 3 — Compliance (Ley 1581 + hardening)" con este contenido (adaptar al formato del documento; ojo: las 5 menciones existentes de "fase 3" en ESTADO.md son de una numeración VIEJA — tenant_id/aislamiento — no confundirlas con esta):

> ### Fase 3 — Compliance (Ley 1581 + hardening OWASP) — 2026-09
>
> **Tablas nuevas (registro, `create_all()`, sin migraciones):** `consentimientos` (usuario, versión, fecha, IP, origen; `UNIQUE(usuario_id, version)`), `solicitudes_supresion`, `export_attempts` (freno del export, por usuario). **En la base de cada cliente:** `space_faces` (designación explícita de la cara del mueble: una fila por espacio).
>
> **Reglas duras nuevas:**
> - `VERSION_POLITICA = "2026-09-v1"` (`models/consentimiento.py`) — debe coincidir con el encabezado de `docs/legal/politica-datos.md`, y `frontend/src/legal/politica-datos.md` debe ser copia byte a byte de ese doc (test `x21` lo fija).
> - Alta exige `acepta_politica=true` → si no, 422 antes de cualquier escritura. `/oauth` devuelve 428 `consentimiento_requerido` solo cuando el canje crearía una membresía NUEVA; usuario existente recibe `pedir_consentimiento: true` top-level (el JWT NO cambia de forma). `POST /auth/aceptar-politica` → 204 idempotente. Login legado intocado.
> - **Owner-only** (export, supresión) = `sub` en el JWT + membresía activa `rol=="owner"` leída del registro. El rol del token NO alcanza (owner viaja como admin). Legado → 403 por construcción.
> - `GET /api/clientes/mi-export` (3/hora → 429) excluye SIEMPRE bitácora, hashes, tablas de intentos y `estados_cliente` — por construcción (el router no las importa). `POST /solicitar-supresion` → nada se borra nunca; atiende el operador en `/api/plataforma/supresiones` con nota obligatoria.
> - **Cara del mueble = designación explícita** (`uso=cara` en el upload → `space_faces`), nunca heurística de recencia. Un espacio sin designación no tiene cara para worker ni 3D (fail closed). `list_face_images` y el gate de `files.py` leen la MISMA tabla. Borrar el archivo borra la designación.
> - CSP con los hosts medidos de Firebase (identitytoolkit/securetoken en connect-src, apis.google.com en script-src, *.firebaseapp.com en frame-src); única concesión `'unsafe-inline'` en style-src. HSTS mira también `x-forwarded-proto` (Render). Cabeceras en TODA respuesta, errores incluidos.
> - Página pública `/politica-datos` sin login. CI de dependencias en `.github/workflows/deps-audit.yml` (falla solo HIGH/CRITICAL).
>
> **Pendientes de la fase:** m-3 el interruptor de estado (402) corta export/supresión/aceptar-politica al owner suspendido — decisión de negocio pendiente, candidato a bloqueante comercial; m-5 imagen con prefijo `montaje--` baja para worker sin bitácora (`test_x28`, xfail strict); m-6 el 404 al worker no se anota (`test_x19b`, xfail strict); m-7 tarea operativa post-deploy: re-designar la cara de todos los espacios existentes; m-4 smoke de navegador de la CSP pendiente; política y guía RNBD son BORRADOR con `[COMPLETAR]`/`[VALIDAR CON ABOGADO]` — no publicar sin abogado.

---

## Artefactos

- Plan y contratos: `features/compliance/outputs/maestro-plan-equipo.md`
- Outputs por agente: `legal.md`, `consentimiento.md`, `derechos.md`, `hardening.md`, `red-team-exfiltracion.md` (mismo directorio)
- Tests de la fase: `backend/tests/test_compliance_ataques.py` (39), `test_derechos.py` (17), `test_consentimiento.py` (17), `test_hardening.py` (8), `test_files_acceso.py` (reescrito, 16)
- Sondas del Maestro (fuera del repo): `/tmp/claude-0/-home-user/ec50873b-2574-5c04-9eb9-9bb14f1c55a8/scratchpad/probe/`
