# RECABRA — estado del proyecto

Documento de referencia para retomar el trabajo sin tener que reconstruir el contexto.
Última actualización: 2026-09-05 (Fase 8 — Detalle por cliente para asesoría: el operador ve espacios, contratos y proveedores de cada cliente, solo lectura, con bitácora, reporte y política ampliada).

Gestión de espacios comerciales en supermercados: se dibuja el plano de cada sede, se
marca qué muebles se pueden alquilar y se les asignan contratos de proveedores.

---

## Cómo corre

| | |
|---|---|
| **Producción** | [retail-espacios.onrender.com](https://retail-espacios.onrender.com) — Render, auto-deploy desde `main` |
| **Backend** | FastAPI + SQLAlchemy 2 + Postgres (`backend/`) |
| **Frontend** | React 18 + TS + Vite + Three.js (`@react-three/fiber@8`) + Tailwind + CSS vars (`frontend/`) |
| **Tipografía** | Geist / Geist Mono desde Google Fonts |
| **Roles** | `admin` y `worker` (JWT). Los precios se redactan server-side para worker, que además solo ve el Dashboard |

Sedes reales: **NAVE**, **POBLADO**, **ciudad jardin**. `TERRON`, `CENTRO`, `NORTE` y
`SUR` son las que la app trae por defecto.

### Levantar el entorno local

```bash
# backend
cd backend && DATABASE_URL="sqlite:///./dev.db" JWT_SECRET=dev uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Para que dos máquinas compartan datos en desarrollo, creá `frontend/.env.local`:

```
VITE_API_TARGET=https://retail-espacios.onrender.com
```

Sin eso, cada máquina habla con su propio backend y su propia base — y ninguna
sincronización puede funcionar entre ellas.

---

## Reglas duras

Estas no son preferencias. Romperlas rompe producción.

**Sin migraciones.** El esquema se crea con `Base.metadata.create_all()`. Eso crea
*tablas* nuevas pero **no agrega columnas a tablas existentes**: una columna nueva en
`spaces` o `layout_snapshots` simplemente no existiría en la base ya desplegada. Cuando
hizo falta guardar algo nuevo, se usó la tabla `app_config` (clave/valor) o el propio
JSON del layout.

**Modelo de datos dual.** Los datos comerciales viven en dos lados a la vez:

- Denormalizados dentro de cada fixture, en el JSON por sede de `layout_snapshots`
  (tipo `UnifiedFixture` en `frontend/src/types/fixtures.ts`).
- Normalizados en `spaces` / `space_leases` / `suppliers`, pero **solo** cuando se pulsa
  "Guardar contrato".

El código de espacio es `"SEDE-CODE"` en mayúsculas. La cara B de una góndola doble usa
sufijo `-B`; los campos top-level del fixture son la Cara A y `fixture.faceB` es la B
(helper `isDoubleGondola`).

**Dentro del plano el código es corto; afuera lleva la sede.** `PUN-01` es nomenclatura
de sede y se repite en las tres tiendas. Todo lo que salga del layout — la fila en
`spaces`, el enlace del correo, el reporte de montaje — usa el código completo, que arma
`fullSpaceCode(sede, code)` en `frontend/src/types/fixtures.ts`. Indexar por el código
corto es un bug silencioso: parece funcionar con una sola sede y con dos empieza a
mezclar tiendas.

**El 3D pinta, no construye.** La foto del proveedor se aplica *como material* de la cara
del mesh, tileada como planograma y alineada a las tablas reales vía `getPanelShelfSpan`.
Nunca crear geometría nueva posicionada para esto: se intentó dos veces y falló las dos.

**Orden de rutas en FastAPI.** Las rutas literales van declaradas **antes** de las
paramétricas y del catch-all, o éste se las traga. Aplica en `layout.py`
(`/revisions`, `/settings`) y en `spaces.py` (`/face-images`).

**`/` es pública; el ingreso vive en `/login`.** Sin sesión, `App.tsx` mira
`window.location.pathname`: `/` monta la landing (`src/pages/Landing/`) y **cualquier
otra ruta sigue montando `Login`**, que es lo que hace que un enlace guardado a
`/reporte-plataforma` termine ahí después de entrar. Lo que se resuelve ANTES que eso no
cambió y no puede cambiar: `/politica-datos` es pública y el enlace de montaje
(`/?montar=…&t=…`) manda sobre todo, así que la mercaderista nunca ve la landing aunque
su enlace caiga en `/`. El correo de invitación sigue apuntando a `/login?invitacion=…`
(`routers/usuarios.py`) y los CTA de la landing a `/login#registro`, que abre `Login` ya
en modo registro. La landing es **pública de verdad**: cero llamadas a `/api/*`, cero
datos de cliente —el plano isométrico es un supermercado inventado sembrado en
`src/pages/Landing/datos.ts`— y cero recursos externos. Su CSS cuelga entero de `.lp`
porque redefine tokens que se llaman igual que los de `src/index.css`; un selector suyo
que se escape repinta el tablero. three.js entra sólo por el `import()` perezoso de «Ver
en 3D» (`Vista3D.tsx`): el bundle inicial de `/` no lo lleva.

**El dinero no viaja al worker.** `negotiatedValue` se redacta server-side en las
respuestas de layout, `monthly_rent` en las de spaces, y las tarifas de referencia
exigen admin **también para leer**. En el cliente, las tarifas quedan fuera de
`partialize` a propósito: la clave `retail-fixtures-v1` sobrevive al logout, y una
máquina compartida no debe entregarle precios al siguiente turno.

**Los planos del store están SCOPED por cliente.** `retail-fixtures-v1` sobrevive
al logout (para poder leer el mapa offline), pero en un mundo multi-cliente eso
significaba que entrar con la cuenta de OTRO supermercado en la misma máquina
mostraba —y, peor, el bootstrap de `syncFromServer` SUBÍA— los planos del cliente
anterior a la base del nuevo. El store guarda ahora `clienteCache` (el slug dueño
del caché) y `scopeToCliente(cliente)` descarta todo lo persistido si la sesión
que abre pertenece a otro cliente, ANTES de cualquier sync. Se llama desde el
efecto de sesión de `App.tsx`, antes de `startAutoSync`. El dinero ya salía de
`partialize`; esto hace lo propio con los planos ante un cambio de inquilino.

**Los espejos comparan identidad, no booleanos.** El plano 2D y el editor 3D mantienen
una copia local del store. Los guards que evitan el eco comparan la *identidad del array*,
no una bandera: un booleano lo consume la pasada equivocada del ciclo de montaje, y eso
causó una pérdida de datos real (ver más abajo).

---

## Qué está hecho

### Identidad: cuentas individuales con Google/correo (Fase 1)

Conviven DOS formas de entrar, y las dos emiten el mismo JWT:

- **Legado**: las dos claves compartidas por rol (admin/worker) de siempre —
  intacto, byte a byte el mismo payload. Se apagará por cliente cuando ese
  cliente haya migrado a cuentas.
- **Cuentas individuales**: Google o correo/contraseña vía Firebase Auth
  (`POST /api/auth/oauth`). El backend NO corre SDK de Firebase: verifica el
  ID token contra el JWKS de Google (RS256 forzado desde el header — inmune a
  `alg none` y a la confusión RS256→HS256 —, clave por `kid`, `aud` =
  `FIREBASE_PROJECT_ID`, `iss` de securetoken, y **leeway de 60 s** porque
  medio segundo de desfase de reloj real bastó para rechazar todo token
  recién emitido). El JWT propio solo gana `sub` y `email`: todo el
  middleware y la redacción de dinero por rol siguen tal cual.

Las tablas de identidad (`usuarios`, `membresias`, `invitaciones`) viven en
la **base por defecto (el registro)**, junto a `clientes` — identidad global,
se lee SIEMPRE con `sesion_registro()`. Son tablas nuevas: `create_all()` las
crea, sin migración. El rol sale de la MEMBRESÍA (owner/admin/worker; owner
viaja como admin en el token), nunca del pedido. Invitación por correo con
expiración; se canjean TODAS las pendientes al entrar. Desactivar una
membresía corta el acceso de ESA persona en el siguiente request (cache de
60 s con invalidación explícita al desactivar). El freno de fuerza bruta de
`/oauth` usa una tabla propia (`intentos_oauth`) para no contaminar el del
login legado. Un correo es confiable si viene verificado o si el token lo
emitió Google — LA MISMA vara en la puerta y en la vinculación por correo
(tener dos varas causaba un 500 que además era oráculo de correos).

Config: backend `FIREBASE_PROJECT_ID` (sin ella, `/oauth` da 503 y el legado
sigue solo); frontend `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` /
`VITE_FIREBASE_PROJECT_ID` (sin ellas, la pantalla muestra solo el login
legado). Ver `render.yaml` para el deploy. Verificado de punta a punta contra
el proyecto Firebase real (`recabra`): firma, JWKS, audiencia y emisor.

### Clientes comerciales: alta self-service y estado de cuenta (Fase 2)

Un usuario con cuenta (Google/correo) y sin membresías puede **fundar su
supermercado**: `POST /api/clientes/alta` recibe el ID token de Firebase
directamente (la misma vara de correo confiable que `/oauth`), valida TODO
antes del paso irreversible (`crear_cliente()`), y el fundador nace **owner**.
Frenos: slugs reservados, tope de 2 fundaciones por usuario, freno por IP en
tabla propia (`alta_attempts`).

El **estado de cuenta** por cliente (`activo`/`gracia`/`solo_lectura`/
`suspendido`) vive en la tabla nueva `estados_cliente` del registro — **fila
ausente = activo**, así que los clientes existentes no necesitaron backfill.
El corte se aplica en UN lugar (`cliente_del_pedido`) y SOLO con credencial
presente (contestar 402 a un anónimo delataría quién dejó de pagar): `gracia`
avisa sin cortar; `solo_lectura` deja GET y corta mutaciones de negocio con
402 (auth y gestión de usuarios siguen, para poder entrar a ver y pagar; las
escrituras internas de un GET permitido, como `expire_leases()`, no se
cortan); `suspendido` corta todo salvo el login del owner, que es el ÚNICO que
ve el `motivo` escrito por el operador — su gente ve el estado, nunca la deuda.
Los datos jamás se borran por estado.

**Operadores de plataforma**: correos en la env `OPERADOR_EMAILS`, solo para
cuentas con `sub` (el legado jamás). Panel en `/api/plataforma/*`: listar
clientes con estado y `PATCH` con motivo obligatorio. **Enmendado en Fase 4,
re-enmendado en Fase 7 y ampliado en Fase 8** (ver esas secciones más abajo):
el operador accede a datos de negocio de los clientes SOLO a través de los
endpoints de plataforma definidos en las specs — hoy los **agregados exactos**
de `/metricas`, `/tendencia` y `/adopcion` y el **detalle de negocio** de
`/clientes/{slug}/detalle` (espacios, contratos y proveedores de UN cliente
por vez) —, siempre **solo lectura**, siempre anotado en la bitácora del
registro con el email del operador, y siempre declarado en la política §5.3 y
en el catálogo del reporte de transparencia. Lo que ningún endpoint abre:
contactos y notas de proveedores, notas de espacios y contratos, fotos y
archivos, datos de usuarios y la tarifa de referencia.
Red-team dedicado en `tests/test_plataforma_ataques.py` (30 ataques; la
frontera resistió).

### Compliance: Ley 1581, consentimiento y hardening (Fase 3 comercial)

**Tablas nuevas (registro, `create_all()`, sin migraciones):** `consentimientos`
(usuario, versión, fecha, IP, origen; `UNIQUE(usuario_id, version)`),
`solicitudes_supresion`, `export_attempts`. **En la base de cada cliente:**
`space_faces` (designación explícita de la cara del mueble).

**Reglas duras nuevas:**
- `VERSION_POLITICA = "2026-09-v2"` (`models/consentimiento.py`, subida en Fase
  7 Parte C) — debe coincidir con el encabezado de `docs/legal/politica-datos.md`,
  y `frontend/src/legal/politica-datos.md` es copia byte a byte (test lo fija).
  El historial de versiones vive en §11 de la política ("Vigencia y
  versionado"), no en §10.
- El alta exige `acepta_politica=true` → 422 antes de cualquier escritura.
  `/oauth` devuelve 428 `consentimiento_requerido` solo cuando el canje crearía
  membresía NUEVA; usuario existente recibe `pedir_consentimiento: true`
  top-level (el JWT NO cambia de forma). `POST /auth/aceptar-politica` → 204
  idempotente. Login legado intocado.
- **Owner-only** (export, supresión) = `sub` + membresía activa `rol=="owner"`
  leída del registro; el rol del token NO alcanza. Legado → 403 por
  construcción.
- `GET /api/clientes/mi-export` (3/hora → 429) excluye SIEMPRE bitácora,
  hashes, tablas de intentos y `estados_cliente` — por construcción.
  `POST /solicitar-supresion` → nada se borra nunca; atiende el operador en
  `/api/plataforma/supresiones` con nota obligatoria.
- **Los derechos del titular NO se cortan por estado de cuenta**: export,
  solicitud de supresión y aceptar-politica están exentos del 402 (incluso en
  suspendido) — el interruptor de cobranza no puede bloquear el habeas data.
- **Cara del mueble = designación explícita** (`uso=cara` → `space_faces`),
  nunca heurística de recencia; sin designación no hay cara para worker ni 3D
  (fail closed). Borrar el archivo borra la designación.
- CSP con los hosts medidos de Firebase (identitytoolkit/securetoken en
  connect-src, apis.google.com en script-src, *.firebaseapp.com en frame-src);
  única concesión `'unsafe-inline'` en style-src. Verificada en navegador
  headless: login completo, cero violaciones. HSTS mira también
  `x-forwarded-proto` (Render). Cabeceras en TODA respuesta, errores incluidos.
- Página pública `/politica-datos` sin login. CI de dependencias en
  `.github/workflows/deps-audit.yml` (falla solo HIGH/CRITICAL).

**Pendientes de la fase:** m-5 imagen con prefijo `montaje--` baja para worker
sin bitácora (xfail strict); m-6 el 404 al worker no se anota (xfail strict);
m-7 tarea operativa post-deploy: re-designar la cara de los espacios
existentes; la política y la guía RNBD son **BORRADOR** con `[COMPLETAR]` /
`[VALIDAR CON ABOGADO]` — no publicar sin abogado.

### Fase 4 — Consola de plataforma

El dueño del SaaS opera y entiende su negocio desde una superficie propia.

- **Ruta `/plataforma`**, página completa fuera del layout de cliente (sin
  Topbar de sede) — el modal `PlataformaPanel` murió, su contenido (estados
  + supresiones) se mudó a la página. Un operador sin membresías aterriza
  ahí directo tras el login con Google; uno con membresías llega por el
  botón del Topbar, que ahora navega en vez de abrir modal.
- **`GET /api/plataforma/metricas`**: consolidado + por cliente con los
  agregados **taxativos** de la spec (sedes con plano, espacios
  comercializables, % de ocupación, canon promedio mensual, ingreso
  contratado del mes, top 5 proveedores por nombre + conteo de contratos,
  usuarios con cuenta y fecha del último acceso, estado de cuenta). Cache de
  5 min **en memoria del proceso**. Tabla **nueva** del registro
  `bitacora_plataforma` (sin migración, mismo patrón que las tablas de la
  Fase 3): cada consulta de métricas anota el email del operador, cuándo y
  qué período — hit de cache incluido. Las bases de cliente se abren
  **read-only y en secuencia**, tolerantes a fallos (patrón de
  `_run_lease_maintenance`: una base rota marca error en su fila, el resto
  del panel sigue). **Nombre de proveedor saneado**: `top_proveedores` no
  devuelve `Supplier.name` verbatim — se depura de correos y teléfonos (se
  enmascaran) antes de entrar al JSON, para que el campo de texto libre que
  carga el supermercado no filtre un dato de contacto de un tercero.
- **Enmienda de la regla del operador, RE-ENMENDADA en Fase 7 y AMPLIADA en
  Fase 8** (ver la nota en "Clientes comerciales" arriba): el operador ve los
  **agregados EXACTOS de todos los clientes, sin umbral** — con un contrato
  activo, el ingreso del mes es ese contrato y así se publica — **y, desde la
  Fase 8, también el DETALLE DE NEGOCIO de cada cliente**: espacios (código,
  tipo, estado en el período), contratos (proveedor saneado, marca, canon
  mensual, fechas) y proveedores, más el resumen por tipo, los movimientos de
  12 meses y las oportunidades y recomendaciones que se derivan de todo eso.
  Ese detalle es **de un cliente por vez, solo lectura, con bitácora
  (`accion="detalle"`) y declarado en la política (§5.3 (a)) y en el catálogo
  del reporte de transparencia** (`endpoints: ["detalle"]`), de modo que el
  cliente ve en su propio reporte qué se lee de él y quién lo leyó. El detalle
  abre la base del cliente pedido; la ÚNICA lectura de otras bases es
  `benchmark_por_tipo`, que recorre los mismos clientes que `/metricas` y
  devuelve un promedio de canon por tipo de espacio — un número, sin slugs,
  conteos ni nombres —; `test_auditoria_frontera.py::f01` y
  `test_detalle_ataques.py::d10/d11` fijan que eso es todo lo que cruza. Hasta la
  Fase 6 los agregados se protegían con una supresión de celda chica (K=3: por
  debajo de 3 contratos activos, el dato salía `null`); el dueño de la
  plataforma decidió cambiar el trato en vez de parcharlo (la auditoría
  integral encontró que la regla era porosa, `frontera-5`, resuelto abajo). La
  contrapartida sigue siendo el **reporte de transparencia** (Fase 7, más
  abajo). **Lo que sigue intacto, y es la frontera que no se movió**: datos de
  contacto de proveedores (`contact_name`, `phone`, `email`) y sus notas;
  notas de espacios y de contratos; fotos y archivos (`SpaceFile`,
  `LeaseFile`); cualquier correo, nombre o id de un **usuario** final; la
  **tarifa de referencia** (sólo `tarifa_configurada` sí/no y el spread); y la
  **escritura** — ningún endpoint de plataforma modifica el negocio de un
  cliente. El JSON de `/metricas` sigue sin llevar filas: el detalle vive
  SÓLO en `/clientes/{slug}/detalle`. Un cliente suspendido también aparece en
  métricas (el operador necesita ver el negocio completo).
- **Token de operador sin membresías**: `cliente="plataforma"` (slug
  reservado en el alta — ningún cliente real puede llamarse así). Solo
  resuelve bajo `/api/plataforma/*`; en cualquier otro path da 401 **por
  construcción** (no es una lista de excepciones, es que `cliente_del_pedido`
  no sabe abrir ninguna base de negocio para ese slug).
- SIN MIGRACIONES, login legado y JWT intocados; rutas literales
  (`/metricas`) antes de paramétricas.

**Pendientes conocidos de la fase:**

- El cache de métricas es **por proceso**: con más de un worker de uvicorn
  habría un cálculo por proceso (hoy Render corre uno).
- La época del token plataforma se valida contra la base **por defecto**
  (que también es la de GALERIAS): cambiar la clave del rol `worker` de
  GALERIAS invalida tokens de operador vigentes. Revalidan con Google en un
  click; se aceptó a cambio de no debilitar la revocación.
- `ultimo_acceso` sale de `ultimo_login`, que solo se actualiza en
  `/oauth`: cuentas que solo usan el login legado no mueven esa fecha.
- **H-5, aceptado a conciencia** (`test_m33_…` en `test_metricas_ataques.py`):
  como consecuencia directa del punto anterior, **el admin del cliente que
  vive en la base por defecto puede cerrarle la sesión al operador de la
  plataforma** sin ser operador ni saber que lo hizo — le basta con cambiar
  la contraseña de `worker` de su propio cliente. Efecto máximo: un
  re-login del operador con Google. Se documentó y se aceptó en vez de
  quitarle la validación de época al token (que sería debilitar la
  revocación) o darle una época propia en el registro (clave nueva, regla
  nueva, para ahorrar un re-login ocasional).
- **M-1 / H-6, mayor, queda para la fase siguiente** (`test_m34_…` en
  `test_metricas_ataques.py`, sirve de recordatorio — no está marcado
  `xfail` porque hoy documenta la conducta aceptada, no una promesa
  incumplida): el cache de métricas de 5 min **no se invalida** cuando el
  operador cambia el `estado_cuenta` de un cliente con `PATCH`
  (`invalidar_cache_estado` limpia el cache de `plataforma_estado`, pero no
  llama a `limpiar_cache_metricas()`). Durante hasta 5 minutos el panel de
  métricas puede seguir mostrando `estado_cuenta: "activo"` de un cliente
  que el propio operador acaba de suspender en la misma pantalla. No es un
  problema de privacidad (no hay dato personal de por medio), es de
  confianza en el tablero. El arreglo (llamar `limpiar_cache_metricas()`
  desde el `PATCH` de estado) queda para la fase siguiente.
- La Política de Tratamiento de Datos ganó un punto (5.3) declarando estas
  métricas, marcado `[VALIDAR CON ABOGADO]`. **`VERSION_POLITICA` NO se
  subió en esta fase**: no por regla general, sino porque la condición que
  el propio red team fijó para eso —que los agregados no permitan
  reconstruir un valor individual (H-2) ni filtrar un dato de contacto de un
  tercero (H-1)— quedó satisfecha por la regla de los 3 contratos y el saneo
  de nombre de proveedor descritos arriba. **Superado en Fase 7**: al quitar
  la regla de los 3 contratos el trato cambia de forma material, y
  `VERSION_POLITICA` sube a `"2026-09-v2"` (ver la sección Fase 7 más abajo).

### Fase 5 — Tendencia temporal (histórico de métricas)

La Fase 4 dejó una **foto**; ésta agrega la **película**. El motivo es que un mes
pasado ya no se puede recorrer: la base de un cliente guarda los contratos como
están HOY, no como estaban en agosto, así que preguntarle por un mes viejo
devuelve la verdad de hoy proyectada hacia atrás. Sin historia persistida,
"¿estamos mejorando o empeorando?" es incontestable.

- **Tabla nueva del registro `snapshot_metricas`** (`create_all()`, SIN
  migración; cero columnas agregadas a tablas existentes, `bitacora_plataforma`
  incluida). `UNIQUE(cliente_slug, periodo)`. Una fila por cliente y mes, más la
  fila del total con `cliente_slug = "__consolidado__"` (constante
  `CONSOLIDADO_SLUG`; los guiones bajos la dejan fuera de `SLUG_VALIDO`, así que
  ningún cliente real puede colisionar). Guarda **CRUDOS**: `sedes_con_plano`,
  `espacios_comercializables`, `ocupadas`, `contratos_activos`, `canon_total`,
  `usuarios` (un CONTEO — **ningún id, correo ni nombre baja a disco**;
  la deduplicación de la misma persona con cuenta en dos supermercados se
  resuelve en memoria al capturar), `proveedores_json` (`{nombre_SANEADO:
  conteo}`, top-5 elegido con el nombre original y saneado al bajar — ver
  Auditoría integral), `clientes_incluidos`, `clientes_con_error`,
  `origen` (`"vista"` | `"cierre"`) y `capturado_en`.
- **El saneo del nombre del proveedor se aplica al ESCRIBIR (y también al
  leer, idempotente)**, no al guardar los números
  (`plataforma_tendencia.publicar_fila` reusa `_pct`, `_plata` y `_top` de
  `plataforma_metricas` — cero fórmulas duplicadas). Así la regla vive en un
  solo lugar. Hasta la Fase 6 este mismo camino aplicaba además la supresión
  de celda chica (K=3) AL LEER; la Fase 7 la quitó — el histórico entero
  publica ahora el número exacto sin tocar una fila persistida.
  **`contratos_activos` y `ocupadas` nunca salen** al JSON: son crudos de
  negocio (numerador y denominador de la ocupación), no algo que la spec deje
  cruzar la frontera del operador — eso no cambió con Fase 7.
- **Poblado híbrido, sin job nuevo**:
  - *Write-through*: `calcular(anio_mes, origen="vista")` hace el upsert justo
    antes del `return`. Va colgado del **cálculo** y no del endpoint, porque un
    acierto del cache de 5 min no recalcula nada ni trae los crudos. Si la
    persistencia falla, `/metricas` responde igual (log y no propaga).
  - *Cierre automático*: `cerrar_mes_anterior()` al **final** de
    `_run_lease_maintenance` (ciclo de 12 h), DESPUÉS del recorrido por
    clientes. Es tarea de la plataforma y no de cada supermercado (se hace una
    vez por corrida). Si al mes ya cerrado le falta la fila consolidada o la de
    algún cliente del registro, llama a `calcular(mes, origen="cierre")`; si no
    falta nada, no hace nada. **Va al final y no al principio a propósito**:
    cuando falta una fila recorre todas las bases, y hacerlo antes de
    vencimientos y recordatorios retrasaba ese barrido varios segundos en cada
    arranque (Render reinicia seguido) y volvía intermitentes los tests de
    `test_recordatorios.py`, que comparten el hilo de mantenimiento con el
    fixture `client`.
  - **El apagado ESPERA al hilo de mantenimiento** (`lifespan`, tope 30 s).
    Cancelar la tarea asyncio cortaba el `await`, no el hilo: el hilo seguía
    vivo después del shutdown y, en los tests (misma memoria, `DATABASE_URL`
    ya apuntando al archivo del test siguiente), terminaba escribiendo el
    snapshot en la base de OTRO test — `ERROR` intermitentes en el setup del
    siguiente. La vuelta en curso se guarda en `_mantenimiento_en_vuelo` y el
    shutdown la `await`ea; el hilo mira `_stop_mantenimiento` entre clientes y
    antes del cierre mensual, así que normalmente termina en milisegundos.
  - **Regla del congelado**: el mes EN CURSO se sobreescribe siempre (converge);
    un mes PASADO se inserta sólo si falta, FILA POR CLIENTE — eso nunca cambia.
    Un cliente con la base rota **no recibe fila** — un hueco es la verdad, un
    cero sería una mentira congelada.
  - **Excepción del congelado, sólo para la fila `__consolidado__`**: si una
    captura de un mes YA PASADO inserta al menos una fila por cliente que
    faltaba (un cliente nuevo con historia retroactiva, o una base que estuvo
    rota durante el cierre y ahora se pudo leer), la consolidada de ESE período
    se **reconstruye** a partir de TODAS las filas por cliente ya persistidas
    (no sólo las de esta captura), en la misma transacción del upsert —
    `persistir_snapshots` en `app/plataforma_tendencia.py`. El total nunca
    puede contradecir a sus sumandos, ni siquiera congelado. El ponderado (Σ/Σ)
    de la reconstrucción usa el mismo helper compartido que arma el
    consolidado la primera vez: `consolidar_crudos` en
    `app/plataforma_metricas.py`. La reconstrucción suma SIEMPRE desde disco
    para los clientes con fila previa y sólo toma de memoria los slugs recién
    insertados en esta captura (BUG-1, iteración 3 — auditoría integral,
    bugs-1: usar los crudos de HOY para un mes pasado contradecía a las filas
    congeladas): exacta para ingreso/ocupación/contratos/sedes; **aproximada
    para usuarios y proveedores** en las filas que vienen de disco (conteo sin
    ids, top-5 sin conteo completo). Limitación conocida, aceptada.
- **`GET /api/plataforma/tendencia?cliente=<slug|__consolidado__>&meses=N`**
  (default consolidado / 12, máx 24). `require_operador`, ruta **literal
  declarada justo después de `/metricas`** y antes de `/supresiones/{id}` y
  `/clientes/{slug}`. **No abre ninguna base de cliente**: lee sólo el registro.
  Sin cache (son N filas de una tabla indexada). `meses` fuera de rango → 422;
  slug inexistente → 404 con texto FIJO ("No hay un cliente con ese código.").
  La serie trae **siempre N meses consecutivos** terminando en el mes en curso
  (UTC), del más viejo al más nuevo: un mes sin fila sale con `sin_dato: true` y
  todo en `null` en vez de omitirse (un hueco callado en un gráfico de línea se
  lee como una caída), y el mes en curso va marcado `parcial: true`.
- **Consolidado ponderado (Σ/Σ)**: la fila guarda SUMAS, nunca promedios, y el
  canon promedio y la ocupación se derivan al leer. Guardar el promedio ya
  calculado dejaría sin sumandos y la única cuenta posible pasaría a ser el
  promedio de promedios — la equivocada (la lección de vitrinas).
- **Bitácora**: cada consulta anota `accion="tendencia"` en
  `bitacora_plataforma`, con el alcance completo como QUÉ de la línea
  (`periodo = "<cliente>:<desde>..<hasta>"`, p. ej.
  `"__consolidado__:2025-10..2026-09"`) — lo consultado acá es un rango, no un mes.
- Login legado, redacción por rol y JWT intocados.

**Pendientes conocidos de la fase:**

- **Un cliente con la base rota deja el cierre "incompleto" para siempre**:
  `cerrar_mes_anterior()` compara contra `ClienteRow`, así que mientras a ese
  cliente le falte la fila del mes anterior, cada corrida del ciclo (12 h)
  vuelve a recorrer todas las bases. Es idempotente y barato en la escala
  actual, pero es trabajo repetido: la alternativa (anotar "este mes ya se
  intentó") pedía una tabla o una columna más.
- ~~El primer mes de vida de un cliente puede quedar con el consolidado
  incompleto~~ — **arreglado**: si el ciclo cierra el mes anterior antes de que
  un cliente nuevo exista (o antes de que su base se pudiera leer) y después
  aparece su fila, el consolidado de ese mes **se recompone** en vez de quedar
  congelado sin él (ver "Excepción del congelado" arriba). Test
  `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues` en
  `backend/tests/test_tendencia_conciliacion.py` (ya no `xfail`).
- El histórico **no se rellena hacia atrás**: la serie arranca vacía y se llena
  mes a mes desde el despliegue. Un backfill sería inventar datos.

### Fase 6 — Asesoría

Cierra el roadmap de asesoría de la consola con las dos lecturas que faltaban
para que una sesión tenga algo concreto que recomendar: **oportunidad de
precio** (spread canon vs tarifa de referencia) y **cohortes de adopción**
(cuentas fantasma). Backend y frontend completos en esta fase.

**Spread (oportunidad de precio).** `spread_pct = (Σ canon_con_tarifa / Σ
tarifa_aplicable − 1) × 100`, por cliente y consolidado, con un helper propio
`_spread` (`null` sólo por ausencia de dato: sin contratos con tarifa
aplicable, o sin tarifa acumulada positiva — ver Fase 7, que le quitó el
umbral K=3 que aplicaba hasta la Fase 6). **La tarifa NUNCA sale de la base
del cliente**: ni su valor, ni su suma, ni un promedio — sólo la relación.

- **Dónde vive**: `backend/app/plataforma_metricas.py`. `_numeros_del_layout`
  gana un tercer valor de retorno, `mapa_tipos` (`codigo_completo -> (SEDE,
  tipo)`), armado en la MISMA pasada que ya abre el plano para
  `_caras_comercializables` — no se abre una segunda vez por contrato.
  `_tarifas_limpias(db)` lee `reference_rates_raw` (de `routers/layout.py`) y
  aplica la MISMA regla de `_clean_rates` (sólo números > 0); import local,
  misma sesión del cliente que ya está abierta. `_tarifa_aplicable` resuelve
  sede-o-default por contrato. Los cinco crudos nuevos
  (`canon_con_tarifa`, `tarifa_total`, `contratos_con_tarifa`,
  `contratos_sin_tarifa`, `tarifa_configurada`) se calculan en
  `_metricas_de_un_cliente` y NUNCA entran a `publicas_desde_crudos` —esa
  función la reusa la tendencia (Fase 5), que reconstruye crudos desde disco
  sin estas claves y tiraría `KeyError`—; los tres campos públicos por
  cliente (`spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`) se
  agregan DESPUÉS, en `_metricas_de_un_cliente`, igual que `ultimo_acceso`.
  El consolidado (`spread_pct`, `clientes_con_tarifa`) se calcula en
  `_consolidar` —sólo `/metricas`—, nunca en `consolidar_agregado` ni
  `consolidar_crudos`, por la misma razón de la tendencia.
- **Decisión de privacidad**: contrato cuyo espacio no está en el mapa (código
  fuera del plano) o cuyo tipo no tiene tarifa aplicable (ni por sede ni
  default) → cuenta en `contratos_sin_tarifa` y queda fuera del spread. Sin
  ninguna tarifa configurada → `spread_pct: null`, `tarifa_configurada:
  false`, `contratos_sin_tarifa` = todos los activos del período (es el
  estado inicial más común). Consolidado ponderado (Σ canon_con_tarifa / Σ
  tarifa_total de los clientes LEGIBLES), nunca promedio de spreads —
  verificado a mano en `test_plataforma_spread.py` con un reparto asimétrico
  a propósito.
- **Caché**: el spread viaja en el mismo cuerpo de `/metricas`, mismo caché
  de 5 minutos, mismo `limpiar_cache_metricas()`.
- **Riesgo residual aceptado (documentado, no un bug), vigente tras Fase 7**:
  con n contratos con tarifa del mismo tipo y `contratos_sin_tarifa == 0`,
  alguien que conozca el ingreso publicado puede despejar la tarifa unitaria
  (`ingreso / (1 + spread/100) / n`), sea cual sea n. Hasta la Fase 6 esto se
  aceptaba EN LA FRONTERA de K=3 (con exactamente 3 contratos); sin umbral el
  residual ya no tiene frontera — se acepta para cualquier n, es la misma
  decisión de producto de Fase 7 (agregados exactos, contrapartida en el
  reporte de transparencia), no un descuido de esta fase.
- **Pendiente, fuera de alcance**: histórico del spread. `snapshot_metricas`
  no puede ganar columnas (SIN MIGRACIONES) y una tabla nueva sólo para esto
  no se justifica todavía.

**Adopción (cohortes).** Todo sale del REGISTRO —nunca de una base de
cliente nueva—: `ClienteRow`, `EstadoCliente`, `Membresia` + `Usuario.
ultimo_login`, `Fundacion.creado_en`, más `contratos_activos_por_cliente`
(parte B, abajo). Ningún correo, nombre ni id de usuario sale al JSON; las
fechas van sin hora.

- **Dónde vive**: `backend/app/plataforma_adopcion.py`, función
  `calcular_adopcion()`. La clasificación se calcula UNA vez, en este orden:
  `sin_cuentas` (cero membresías activas) → `nueva` (alta hace menos de 30
  días) → `activa` (algún acceso en 30 días) → `fantasma` (contratos activos
  y sin acceso reciente — la señal que la asesoría busca) → `dormida` (nada
  de lo anterior). Cohorte = mes de `Fundacion.creado_en` más antigua del
  slug, o `ClienteRow.creado` si no hay fundación, o `null` si ninguna de las
  dos existe. Un slug ausente de `contratos_activos_por_cliente` (base rota
  este período) sale con `con_contratos_activos: false` y
  `error: ERROR_BASE_ILEGIBLE`; el resto de la fila (puro registro) se
  calcula igual.
- **Gotcha real, ya corregido**: `datetime` es subclase de `date` en Python
  —`isinstance(alta, date)` da `True` para las dos—, así que reducir
  `ClienteRow.creado` (un `datetime`) a día exige preguntar por `datetime`
  explícitamente; la pregunta al revés deja pasar el `datetime` intacto y la
  resta contra un `date` revienta con `TypeError` en el primer cliente sin
  `Fundacion` (típicamente `galerias`).
- **Router**: `GET /api/plataforma/adopcion`, sin parámetros, declarado
  INMEDIATAMENTE después de `/tendencia` y antes de `/supresiones/{id}` y
  `/clientes/{slug}` (orden literal-antes-de-paramétrica). Bitácora SIEMPRE,
  `accion="adopcion"`, después de calcular.

**Conteo de contratos para adopción, sin abrir bases nuevas (parte B).** El
cuerpo de `calcular()` se partió: `_calcular(anio_mes, origen) -> (cuerpo,
{slug: nº contratos activos | None})` hace el recorrido real y devuelve el
conteo de contratos activos por cliente como segundo valor (de uso INTERNO,
nunca al JSON) — `None` para una base que se intentó leer y no se pudo, y el
slug AUSENTE para un cliente que nació después de ese cálculo (así la
adopción no confunde un alta reciente con una base rota); `calcular()` queda como wrapper de siempre, con la misma
firma que ya usaba `cerrar_mes_anterior`. `metricas_del_periodo` llama a
`_calcular` y llena, además del caché de siempre (`_cache`, sin cambiar su
forma), un `_cache_contratos[anio_mes]` con el mismo TTL de 5 minutos.
`contratos_activos_por_cliente(anio_mes)` sirve del caché si está fresco, o
dispara `metricas_del_periodo` (que lo llena) si no. `limpiar_cache_metricas()`
limpia los dos cachés.

**Decisión de privacidad del spread (vinculante, cierra la pendiente de Fase
4; enmendada por Fase 7).** La tarifa de referencia es estrategia comercial
del cliente y NUNCA cruza la frontera del operador: ni su valor, ni Σ tarifa,
ni un promedio, ni por sede. Sólo viaja la relación `spread_pct`. Lista
taxativa de campos nuevos en `/metricas`: por cliente `spread_pct` (`null`
sólo por ausencia de dato: sin tarifa configurada o sin contratos con tarifa
aplicable), `tarifa_configurada`, `contratos_sin_tarifa`; consolidado
`spread_pct` y `clientes_con_tarifa`. Lista negra test-enforced: ninguna otra
clave con `tarifa`, `rates`, `by_sede`, `default`. **Fase 7 — el spread
consolidado vuelve a sumar a TODOS los legibles con tarifa**, igual que ya
hacía el ingreso consolidado: hasta la Fase 6 sumaba SÓLO a los clientes cuyo
propio spread se publicaba (≥ K contratos con tarifa) para que un cliente
suprimido no se despejara por diferencia (hallazgo H-1 de la fase,
`test_asesoria_ataques.py` a16/a17); sin supresión que proteger, esa
distinción con el ingreso consolidado desaparece — el total del negocio es
el dato en los dos casos. Riesgo aceptado (documentado, ya no acotado a K=3):
con n contratos con tarifa del mismo tipo, el ingreso publicado deja estimar
la tarifa unitaria (a18, medido); es la misma aceptación que ya rige el
canon promedio.

**Endpoint `GET /api/plataforma/adopcion`.** Sin parámetros (siempre el mes
en curso UTC). `require_operador`: sin token 401, admin legado 403, dueño de
cliente 403, operador 200. Bitácora siempre, `accion="adopcion"`,
`periodo=<YYYY-MM>`. Responde `{ periodo, generado_en, cohortes: [...],
clientes: [...] }`; el frontend ordena los `fantasma` primero. No abre ninguna
base de cliente que `/metricas` no abra ya. La ventana "activo" es de 30 días
INCLUSIVE (`<= DIAS_RECIENTE`: el día 30 exacto cuenta — hallazgo H-4,
`test_asesoria_contador.py` 10e).

**Frontend (`/plataforma`).** Columna "vs tarifa" en la tabla de clientes con
dos estados (`−12,4 %` / `+3,1 %`; `sin tarifa`) — hasta Fase 6 había un
tercero, `Suprimido ‹3`, que la Fase 7 eliminó; tile en el
hero "VS TARIFA DE REFERENCIA" con la lectura en palabras; panel "Adopción"
debajo de "Tendencia" con tabla de cohortes (mes, clientes, retención 30d,
desglose por badge) y lista "A quién llamar hoy". `components/plataforma/
adopcion.tsx`; primitivas de `consola.tsx`, tokens `--con-*`, claro y oscuro,
sin librerías nuevas, bajo la CSP de Fase 3.

### Auditoría integral (post Fase 6)

Auditoría adversarial del sistema completo (spec en `features/auditoria/spec.md`,
entregables en `features/auditoria/outputs/`), sobre seis dimensiones: ingreso
al sistema, aislamiento multi-tenant y base de datos, frontera del operador,
OWASP/hardening, bugs de las Fases 4–6 y compliance/privacidad. Cinco auditores,
24 hallazgos con reproducción (cada uno con un test en
`tests/test_auditoria_<dimension>.py`, estilo `test_*_ataques.py`), 11
arreglados en la misma rama con el `xfail` convertido en test verde. La
frontera multi-tenant, la verificación de Firebase y los derechos del titular
aguantaron todo sin un solo cruce: lo que se encontró fue de segundo orden.

**Qué se arregló**

- **Uploads con tope de streaming** (`app/services/subidas.py::leer_con_tope`):
  `files.py`, `mounts.py`, `catalogo.py` y `planograms.py` leían el archivo
  ENTERO en RAM antes de comparar contra su límite (con `--workers 1`, un
  archivo de GB tumba el único proceso). Ahora se lee de a 64 KiB y se corta
  apenas se pasa; códigos y textos de respuesta no cambiaron. `montaje.py`
  hereda el arreglo porque delega en `mounts.registrar_montaje`.
- **Tope de tamaño de cuerpo para toda la app, antes de cualquier auth**
  (`subidas.py::LimiteDeCuerpo`, middleware ASGI puro registrado en `main.py`):
  2 MiB para JSON y todo lo que no sea multipart, 12 MiB para
  `multipart/form-data` (el tope propio de cada endpoint lo sigue aplicando el
  helper). `Content-Length` sirve para rechazar de entrada, nunca para
  permitir: decide el conteo real. Responde 413 JSON con las cabeceras de
  seguridad. No es `@app.middleware("http")` a propósito: `BaseHTTPMiddleware`
  no puede intervenir el `receive`. El tope JSON de 2 MiB es un juicio (los
  layouts por sede pesan cientos de KB), vive en `subidas.py::TOPE_JSON`.
- **El `Bearer basura` ya no delata el estado de cuenta** (ingresos-1). Con un
  solo cliente en la instalación, la rama `unico()` de `cliente_del_pedido`
  aplicaba `_aplicar_estado` ante CUALQUIER texto en el header o en `?token=`,
  y el 402 salía antes del 401. Ahora hay `auth.token_verifica()` y la rama
  exige que la credencial verifique (firma y `exp`): sin credencial → 401;
  credencial que no verifica → 401; token nuestro válido (incluso legado sin
  claim `cliente`) → se aplica el estado de cuenta, 402 si corresponde.
- **Exenciones del interruptor con frontera de segmento** (ingresos-2):
  `clientes._path_bajo` (igualdad o prefijo + `/`) reemplaza `startswith` en
  `_EXENTOS_EN_SOLO_LECTURA`, `_EXENTOS_POR_HABEAS_DATA` y
  `_es_path_de_plataforma`. Un solo helper para las tres.
- **BUG-1, iteración 3** (bugs-1): la reconstrucción de la fila
  `__consolidado__` cuando una captura de un mes pasado inserta una fila que
  faltaba ya no usa los crudos de HOY para clientes con fila previa. Regla
  única en `_reconstruir_consolidado`: un cliente con fila persistida antes de
  esta captura se suma SIEMPRE desde su fila en disco; sólo los slugs recién
  insertados salen de memoria. Ingreso, ocupación, contratos y sedes del
  consolidado nunca contradicen a sus sumandos.
- **El nombre del proveedor baja SANEADO a `snapshot_metricas`**
  (compliance-1 = frontera-2). `_recortar_top` elige el top-5 con el nombre
  original y persiste `{sanear_nombre_proveedor(nombre): conteo}`, sumando
  conteos si dos originales sanean igual. Los NÚMEROS siguen crudos y se
  vuelven públicos y exactos al leer (Fase 7, sin umbral); el NOMBRE se
  protege al escribir (y el saneo es idempotente, así que leer sigue pasando
  por `_top`). Sin migración.
- **Saneo Unicode** (frontera-1): `sanear_nombre_proveedor` normaliza NFKC
  (`＠` → `@`, dígitos de ancho completo → ASCII), borra los caracteres de
  categoría `Cf` (ZWSP, ZWNJ, BOM, marcas de dirección) y `_TELEFONO_RE`
  acepta `/ _ · ,` como separadores.
- **Ventana de `periodo`** (frontera-3): `normalizar_periodo` acepta sólo
  `[actual − 24, actual + 12]` meses (`MESES_HISTORIA_MAXIMO`,
  `VENTANA_MESES_ADELANTE`); fuera de ahí, 422 con texto fijo. **Un mes futuro
  NO se persiste** (una proyección no es historia). `_cache` y
  `_cache_contratos` son LRU con `TOPE_CACHE_PERIODOS = 24`.
- **Purga del registro** (frontera-4 = ingresos-5):
  `plataforma_tendencia.purgar_registro()` borra `bitacora_plataforma` con más
  de `DIAS_QUE_SE_GUARDA` días (365, la misma constante que `audit_log`),
  `intentos_alta` con más de 24 h y las filas POR CLIENTE de
  `snapshot_metricas` anteriores a `actual − 36 meses`. **La fila
  `__consolidado__` no se purga nunca**: es la serie larga del negocio. Corre
  al final de `cerrar_mes_anterior()`, en su propio `try/except`, SIEMPRE.
- **Bitácora en las lecturas de PII** (frontera-6): `/supresiones` y
  `/clientes` ahora también anotan en `bitacora_plataforma`
  (`_anotar_consulta`), igual que `/metricas`, `/tendencia` y `/adopcion`.
- **Gate de `pip-audit` con CVSS real** (hardening-8): el script
  `.github/scripts/pip_audit_severity.py` hacía `float()` sobre un vector CVSS
  textual y nunca podía confirmar un HIGH/CRITICAL. Ahora calcula el score
  base v3.x desde el vector y tiene `--self-test`. Consecuencia: el gate falla
  con 9 HIGH confirmados hasta que se actualicen las dependencias (abajo).
- **Guardianes que mentían** (verif-1, verif-2): `test_t32` fallaba sobre un
  comentario por un `A or B and C` sin paréntesis — ahora mira sólo líneas
  del diff con `Content-Security-Policy`; `test_ingresos_16` afirmaba la
  ausencia de purga con grep y quedó verde diciendo algo falso — ahora fija la
  presencia por el objeto real.

**Qué queda abierto y por qué**

- **frontera-5 — RESUELTO por decisión de producto (Fase 7)**. Con un
  cliente que publicaba y otro suprimido por K=3, `ingreso_consolidado −
  ingreso_visible` devolvía al peso el canon del contrato único del
  suprimido — contradecía la regla "el consolidado sí suma a todos" (Fase 4,
  `test_m26`). En vez de parchear la regla (opciones consideradas: sumar
  sólo clientes publicables, o sumar a los suprimidos sólo si entre todos
  juntan ≥ K contratos), el dueño de la plataforma decidió **cambiar el
  trato**: el operador ve los agregados EXACTOS de todos los clientes, sin
  umbral — K=3 desaparece de `/metricas`, `/tendencia` y del spread. Ya no
  hay ninguna celda suprimida que el consolidado pueda despejar. La
  contrapartida es el reporte de transparencia (ver la sección "Fase 7 —
  Transparencia" más abajo). `test_f09` (`test_auditoria_frontera.py`) se
  eliminó con un comentario en su lugar; el helper que usaba no se
  reutiliza en ningún otro test de ese archivo.
- ~~Dependencias con DoS~~ — **cerrado en la misma rama**: `fastapi 0.115.0
  → 0.141.1` (arrastra `starlette 1.6.0`, que parchea CVE-2024-47874, y
  `pydantic 2.13.5`), `python-multipart 0.0.32`, `PyJWT 2.13.0`. `pip-audit`
  limpio. Dos consecuencias de la subida, ya absorbidas: (1) PyJWT ≥ 2.10
  exige que el claim `sub` sea TEXTO — `create_token` emite `str(id)` y
  `auth._sub_entero` lo vuelve entero al leer (`invalidar_cache_membresia`
  acepta las dos formas); (2) con Starlette 1.x `include_router` deja en
  `app.routes` un `_IncludedRouter` sin `path` ni `methods`, así que los
  tests que barrían rutas por atributos recorrían cero rutas y pasaban en
  verde sin comprobar nada — ahora usan `conftest.rutas_planas(app)` (aplana
  en orden de declaración) o el esquema OpenAPI. En el frontend `npm audit
  fix` cerró `browserslist` (HIGH); queda `vite ≤ 6.4.2` (HIGH, sólo servidor
  de desarrollo: path traversal en `.map` y `launch-editor` en Windows) porque
  el salto a Vite 8 es mayor y se hace aparte.
- **Dockerfile sin `USER`** (hardening-9): no verificable contra el disco de
  datos de Render desde acá.
- **H-7 / H-8** (identidad) y **R-3 / R-4 / R-5** (alta self-service) siguen
  xfail; ingresos-4 (falla de infraestructura del alta disfrazada de "slug
  tomado") se suma a R-4.
- Documentados sin cambio: ingresos-3 (leeway sobre `exp`, medido,
  aceptable), hardening-2 (HSTS spoofeable, benigno por RFC 6797 §7.2),
  compliance-2 (validación en el ORM como defensa opcional), compliance-3
  (texto de la política: nombrar Brevo/SendGrid y el enlace con credencial de
  un solo uso en §9.1; completar §6 con 365 días).
- Decisiones de producto anotadas: zona horaria del negocio (`periodo_actual`
  en UTC), supresión de `ultimo_acceso` bajo K cuando hay un solo usuario,
  retención de logs de correo en Render.

### Fase 7 — Transparencia

El operador ve las cifras exactas y cada cliente puede auditar qué se tomó de
él. Decisión del dueño de la plataforma, 2026-09-05, en respuesta directa al
hallazgo `frontera-5` de la auditoría integral: en vez de parchear la regla
de los 3 contratos (K=3), se cambia el trato.

**Parte A — Quitar K=3 (backend, `plataforma_metricas.py` / `plataforma_tendencia.py`).**
`K_MINIMO_CONTRATOS` y `_suprimir_celda_chica` se eliminan del todo (y toda
llamada: `publicas_desde_crudos`, `consolidar_agregado`, `_consolidar`,
`plataforma_tendencia.publicar_fila`). Por cliente y consolidado:
`ingreso_contratado_mes` es SIEMPRE un número (`0.0` con 0 contratos);
`canon_promedio_mensual` es número con ≥1 contrato y `null` sólo con 0
contratos (no hay promedio de cero términos); `top_proveedores` es la lista
real saneada por `_top`, vacía sólo si no hay contratos con proveedor.
`_spread` conserva su firma (`None` si `contratos == 0` o `tarifa <= 0`, si
no `round((canon/tarifa - 1)*100, 1)`) pero sin el piso de K=3. El
consolidado del spread (`_consolidar`) vuelve a sumar a TODOS los clientes
legibles con tarifa — igual que ya hacía el ingreso consolidado — porque sin
supresión que proteger, excluir a los que antes se suprimían no tiene
sentido. En `/tendencia`: `publicar_fila` aplica las mismas reglas exactas;
`contratos_activos` y `ocupadas` siguen sin salir (son crudos de negocio, no
algo que la spec deje cruzar la frontera); nada cambia en snapshot (crudos,
saneo al escribir), caché, bitácora ni adopción. `grep -rn "K_MINIMO|
_suprimir_celda_chica" backend/app` da vacío. Los 9 archivos de test que
afirmaban la supresión (`test_plataforma_metricas`, `test_metricas_conciliacion`,
`test_metricas_ataques`, `test_plataforma_tendencia`, `test_tendencia_ataques`,
`test_tendencia_conciliacion`, `test_asesoria_ataques`, `test_asesoria_contador`,
`test_auditoria_frontera`) se reescribieron para afirmar el comportamiento
nuevo; `test_f09` (frontera-5) se eliminó con un comentario en su lugar.

**Parte B — Reporte de transparencia (`app/plataforma_reporte.py`, sin
migraciones).** La contrapartida de la Parte A: cada cliente puede pedir, a
demanda, cada dato que la plataforma tomó de él, cómo lo calculó, de dónde,
para qué, y quién del operador lo consultó y cuándo. El módulo declara un
`CATALOGO` TAXATIVO en código (no prosa suelta en el frontend) con, por cada
agregado de `/metricas` / `/tendencia` / `/adopcion`: nombre, definición
(fórmula en palabras), fuente (qué tablas), finalidad (`asesoria` /
`salud_cartera` / `cobranza`), endpoints que lo exponen y tratamiento
(`exacto` / `saneado` / `sin_hora` / `conteo` / `relacion`). El catálogo
también declara las cifras que SOLO el reporte publica en `valores[]`
(`ocupadas`, `contratos_activos`, `canon_total`, `origen`, `capturado_en`),
con `endpoints: ["reporte"]` — `"reporte"` es un valor válido de `endpoints`
en el shape (`endpoints:[metricas|tendencia|adopcion|reporte]`). Regla dura:
ninguna clave puede aparecer en `valores[]` sin una entrada en `CATALOGO`
(la fija `test_t62`). El reporte se
arma SOLO con lo que ya existe — `snapshot_metricas`, `bitacora_plataforma`,
`consentimientos`, `solicitudes_supresion` y, para el spread del mes en
curso, `_metricas_de_un_cliente` sobre la base de ESE cliente — sin filas de
contratos.

Endpoints:

- `GET /api/clientes/mi-reporte-plataforma?meses=N` — dueño del cliente
  (`require_owner`, como `/mi-export`), ruta literal en `routers/derechos.py`,
  exenta del interruptor de cobranza (`_EXENTOS_POR_HABEAS_DATA`). `meses` se
  valida primero (`1..MESES_MAXIMO`, si no 422) ANTES de cobrar el freno
  compartido con `/mi-export` — un pedido inválido nunca consume cupo de un
  derecho de habeas data. Ese freno (3/hora por usuario, tabla
  `export_attempts`) queda compartido con `/mi-export`: riesgo aceptado
  (L-3 de la revisión legal), decisión del Maestro de mantenerlo así sin
  migraciones. Un slug ajeno da 403/404 indistinguible.
- `GET /api/plataforma/clientes/{slug}/reporte?meses=N` — operador
  (`require_operador`), declarada DESPUÉS de las literales, anota
  `accion="reporte"` con `periodo="<slug>:<desde>..<hasta>"` en la bitácora
  (el reporte también es un acceso; el reporte siguiente del dueño lo lista).

Los dos devuelven el MISMO JSON:

```
{cliente:{slug,nombre}, generado_en, ventana:{desde,hasta,meses},
 politica:{version_vigente,version_aceptada|null,aceptada_en(fecha)|null,base_legal,url},
 catalogo:[{clave,nombre,definicion,fuente,finalidad:asesoria|salud_cartera|cobranza,
            endpoints:[...],tratamiento:exacto|saneado|sin_hora|conteo|relacion}],
 valores:[{periodo,sin_dato,origen,capturado_en(fecha),sedes_con_plano,
           espacios_comercializables,ocupadas,ocupacion_pct,contratos_activos,
           canon_total,canon_promedio_mensual,usuarios_con_cuenta,
           top_proveedores:[{nombre(saneado),contratos}]}],
 spread_actual:{periodo,tarifa_configurada,spread_pct,contratos_sin_tarifa}|null,
 accesos:{total,lineas:[{fecha,operador,accion,periodo}]},
 derechos:{export,supresion,reporte,contacto}}
```

Frontend: ruta `/reporte-plataforma` (dueño) y `/plataforma/reporte/:slug`
(operador), vista imprimible (`@media print`, sin cabecera de app), botón
"Descargar JSON", reusa `consola.tsx` y los tokens `--con-*`, claro/oscuro en
pantalla y siempre claro en impresión, sin librerías nuevas, bajo la CSP de
Fase 3. El tipo del item de `top_proveedores` en el reporte es
`ProveedorTopReporte {nombre, contratos}` — distinto de `ProveedorTop
{nombre, contratos_activos}` que ya usan `/metricas` y `/tendencia` (no
comparten shape ni nombre de campo de conteo).

**Parte C — Política y consentimiento.** `VERSION_POLITICA` sube a
`"2026-09-v2"` (`models/consentimiento.py`): es un cambio material del trato
(agregados exactos sin umbral, contrapartida del reporte), así que el flujo
existente de re-consentimiento (`consentimiento_requerido` al entrar,
`/aceptar-politica`) se dispara para todos los usuarios con cuenta; el legado
(claves compartidas) no se rompe. §5.3 de `docs/legal/politica-datos.md` (y
su copia byte-idéntica en `frontend/src/legal/`) se reescribe declarando el
trato nuevo con las frases `"agregados exactos"`, `"sin umbral"`, `"reporte
de transparencia"` y `"mi-reporte-plataforma"` (test-enforced,
`test_asesoria_ataques.py` a15), manteniendo los marcadores `[VALIDAR CON
ABOGADO]`. `/mi-export` y el reporte incluyen la versión de política
aceptada.

**Verificación de cierre (2026-09-05).** Sonda independiente sobre base
propia: cliente con 1 contrato de 4.173.919 y tarifa punta 5.000.000 →
`/metricas` publica ingreso 4173919.0, promedio 4173919.0, spread −16.5,
proveedor saneado; consolidado 7673919.0 = Σ de los tres clientes legibles;
`/tendencia` idéntico y `sin_dato: false`. Reporte del dueño: 22 entradas de
catálogo, 12 meses, cero rastros de otros clientes; del operador: mismo shape
y línea `accion="reporte"` en la bitácora que el reporte siguiente del dueño
lista. Re-consentimiento verificado de punta a punta; legado intacto. `tsc` y
`build` limpios. Capturas en `features/transparencia/outputs/capturas/`.

**Gotcha para quien agregue un GET con parámetro de ruta**:
`test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint` barre el
OpenAPI entero con el token de montaje y necesita un valor para cada
parámetro en su diccionario `relleno`. `GET /api/plataforma/clientes/{slug}/
reporte` fue el primer GET con `{slug}` y lo rompió; `slug` ya está en el
diccionario. Un parámetro nuevo sin relleno hace fallar la suite entera a
propósito.

### Fase 8 — Detalle por cliente para asesoría

**La decisión del dueño (2026-09-05, encima de la Fase 7).** "La plataforma aún
no tiene toda la información disponible para hacer análisis: no sé qué proveedor
está en cada espacio adicional y a qué precio". El límite "el operador ve
agregados, nunca filas" era una decisión de diseño de la Fase 4, no una
limitación técnica: para el servicio de **asesoría comercial** que RECABRA le
vende a cada supermercado, el operador necesita ver el negocio **espacio por
espacio** y derivar de ahí qué proponerle hoy al cliente. Esta fase abre esa
vista, **solo lectura**, con bitácora, y la declara en la política y en el
reporte de transparencia **dentro de la misma versión de política**
(`2026-09-v2`, que todavía no se había desplegado) para que el cliente consienta
el trato completo **una sola vez**.

**El endpoint.** `GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM`
(`require_operador`; por defecto el mes en curso, misma ventana que
`/metricas`; `app/plataforma_detalle.py`, ruta declarada AL FINAL de
`routers/plataforma.py`). Abre la base de ESE cliente **una vez**, sólo
`query`, y anota `accion="detalle"` con `periodo="<slug>:<YYYY-MM>"` en
`bitacora_plataforma` **después** de armar (un 401/403/404/422/503 no deja
línea). La única otra apertura de bases es `benchmark_por_tipo`: recorre los
mismos clientes que `_calcular` de métricas (secuencia, read-only, `try/except`
por cliente, caché 5 min con el mismo LRU acotado) y devuelve UN número por
tipo. Por eso `test_auditoria_frontera.py::f01` lista esta ruta entre las que
abren bases, junto a `/metricas`, `/tendencia`, `/adopcion` y `/reporte`.
`slug` inexistente → 404 con el texto fijo `"No hay un cliente con ese
código."`; dueño de cliente, legado y trabajador → 403; sin token → 401;
período fuera de ventana → 422; base ilegible → 503 con `ERROR_BASE_ILEGIBLE`
(la ruta del archivo va al log, nunca al JSON). Sin caché del detalle: cada
consulta se calcula y se anota. SIN MIGRACIONES: todo sale de
`layout_snapshots`, `spaces` (sólo `code`, `zone`, `area_m2`), `space_leases`
(sin `notes` ni ids), `suppliers.name` y `app_config` (sólo el sí/no de la
tarifa), con los helpers que ya existían (`_numeros_del_layout` y su mapa de
tipos, `_es_gondola_doble`, `_tarifa_aplicable`, `sanear_nombre_proveedor`,
`_huella`) más dos nuevos en `plataforma_metricas.py`: `_del_periodo` (la
regla "activo en el período", enunciada una sola vez) y
`_contratos_del_cliente`.

Shape (VINCULANTE, idéntico en backend y frontend):

```
{cliente:{slug,nombre,estado_cuenta}, periodo, desde, hasta, generado_en,
 sedes_con_plano,
 sedes:[{sede,espacios,ocupados,libres,ocupacion_pct}],
 espacios:[{codigo(SEDE-CODE, cara B con -B),sede,codigo_corto,cara:A|B|null,tipo,
            zona(SANEADA),area_m2,estado:ocupado|libre|se_libera,
            contrato:{proveedor(SANEADO),marca(SANEADA),canon_mensual,inicio,fin,
                      dias_para_vencer,arranca_en_periodo}|null}],
 contratos_fuera_del_plano: N,
 resumen_por_tipo:[{tipo,total,ocupados,libres,canon_promedio,canon_minimo,
                    canon_maximo,tarifa_configurada(sí/no)}],
 proveedores:[{nombre(SANEADO),espacios,tipos,sedes,canon_total,canon_promedio,
               participacion_pct(cuota de CONTRATOS, no de canon),desde,
               contratos_por_vencer_60d}],
 movimientos:[{mes,entradas:[{proveedor,codigo,tipo,canon_mensual,fecha,cancelado}],
                   salidas:[{proveedor,codigo,tipo,canon_mensual,fecha,
                             motivo:vencimiento|cancelacion}]}]  (12 meses),
 benchmark_plataforma:{<tipo>: UN promedio de todos los clientes legibles},
 oportunidades:[{codigo,sede,tipo,estado:libre|se_libera,precio_sugerido,
                 origen_precio:cliente|benchmark|null,valor_estimado_mensual,
                 candidatos:[{proveedor(SANEADO),canon_actual,mismo_tipo}]}],
 recomendaciones:[{id:"{tipo}:{clave}",
                   tipo:espacio_libre|contrato_por_vencer|precio_bajo_tarifa|
                        concentracion_proveedor|sede_subutilizada|sin_tarifa|arranque,
                   prioridad:alta|media|baja,valor_estimado_mensual,explicacion,datos}]}
```

**Las reglas de estado, oportunidad y recomendación.** "Contrato del período"
es `is_active AND start_date <= hasta AND end_date >= desde` (`_del_periodo`,
la MISMA regla de `_contratos_activos`); con varios contratos sobre un espacio
se publica el de fin más tardío. Un espacio está `ocupado` si tiene contrato
del período, `se_libera` si además `fin <= hasta`, `libre` si no tiene
ninguno; un contrato que arranca dentro del período cuenta como ocupado
(`arranca_en_periodo`). Un contrato cuyo código no está en el plano no es un
espacio pero sí es plata: cuenta en `contratos_fuera_del_plano`,
`proveedores`, `movimientos` y `contrato_por_vencer`, nunca en `espacios`,
`resumen_por_tipo` ni `oportunidades`. El **precio sugerido** de un espacio
libre o que se libera es el canon promedio que ESE cliente cobra por ese tipo
(`origen_precio: "cliente"`); si no cobra ninguno, el benchmark
(`"benchmark"`); si tampoco, `null`. Los **candidatos** son proveedores del
mismo cliente que no ocupan ese espacio, primero los del mismo tipo, por canon
actual desc, hasta 3. Las **recomendaciones** (`id="{tipo}:{clave}"`) se
ordenan por prioridad, valor desc e id: `espacio_libre` (una por TIPO, valor Σ
precio sugerido), `contrato_por_vencer` (≤ 60 días; ≤ 30 alta y nunca menos
que media), `precio_bajo_tarifa` (tipo con ≥ 2 contratos y alguno bajo el
promedio del PROPIO cliente — nunca contra la tarifa),
`concentracion_proveedor` (≥ 40 % de los contratos del período y ≥ 2
contratos; ≥ 60 % alta), `sede_subutilizada` (≥ 15 puntos bajo la ocupación
global, con ≥ 2 sedes), `sin_tarifa` (una, siempre baja, valor 0) y `arranque`
como ÚNICA con cero contratos del período. Prioridad general: alta desde el
15 % del ingreso contratado del mes, media desde el 5 %. La `explicacion` la
genera el backend por plantilla, sin PII: nombres saneados, códigos, tipos,
fechas y plata como `"$ 1.200.000"`.

**Verificación de cierre (2026-09-05).** Sonda independiente: cliente con 2
sedes, góndola doble, punta y nevera, 3 contratos del período (uno vence el 20,
uno arranca el 15) → 5/5 espacios con tipo, estado y contrato exactos; resumen
gondola 2/2/0 prom 800.000 (min 600.000, max 1.000.000), punta 2/1/1 prom
2.000.000, nevera 1/0/1 `null`; `SUR-PUN-01` sugerido 2.000.000 del cliente,
`NAVE-NEV-01` 400.000 de benchmark = (300.000+500.000)/2 del otro cliente; 7
recomendaciones en orden alta×4 (espacio_libre 4.000.000, contrato_por_vencer
2.000.000 a 19 días, sede_subutilizada 2.000.000, concentracion_proveedor
1.600.000 con 2 de 3 = 66,7 %), media×2, baja×1; 10/10 agujas de PII
ausentes, sólo `tarifa_configurada` como clave con "tarifa"; 401/403/403/404
sin línea de bitácora y exactamente una línea tras el 200, listada en el
reporte del dueño; conteos de filas idénticos antes y después. Capturas en
`features/asesoria-detalle/outputs/capturas/`.

**Pendientes conocidos de la fase:**

- **Benchmark con pocos aportantes**: `benchmark_plataforma` no tiene umbral
  de clientes aportantes por tipo; con dos clientes que tienen un tipo, cada
  uno puede despejar el canon del otro por diferencia. Decisión de producto
  pendiente, misma familia que `frontera-5` (el dueño ya eligió exactitud a
  cambio de transparencia en Fase 7; si se mantiene ese criterio, no hay nada
  que hacer).
- **`participacion_pct` es cuota de contratos**, no de canon: el catálogo y la
  política lo dicen así desde el cierre de Fase 8; si alguien lo cambia a
  canon, cambia también `concentracion_proveedor` y los dos documentos.

**El benchmark de plataforma** es **un número por tipo de espacio** — el canon
promedio de los contratos vigentes de ese tipo en todos los clientes legibles —,
con caché de 5 min como el de métricas, y jamás sale con desglose, sedes ni
nombres de otros supermercados. Es lo único del detalle que mira más de una
base.

**La frontera (lista taxativa de lo que el detalle NO devuelve):**
`Supplier.contact_name` / `phone` / `email` / `notes`; `Space.notes`;
`SpaceLease.notes`; `SpaceFile` / `LeaseFile` (fotos y documentos de montaje);
cualquier correo, nombre o id de un **usuario**; la **tarifa de referencia**
(sólo `tarifa_configurada` sí/no por tipo y el spread que ya existía); cualquier
dato de **otro cliente** dentro del detalle de uno (el benchmark es un promedio,
un número por tipo); ningún texto libre del cliente sin sanear (proveedor,
marca **y zona** pasan por `sanear_nombre_proveedor` — el auditor encontró la
zona sin sanear, `detalle-1`, corregida al cierre); y nada en **modo
escritura**.

**La política (misma versión, `2026-09-v2`).** §5.3 (a) suma el **detalle de
espacios y contratos** con las palabras de la spec (código y tipo del espacio,
ocupado o libre, proveedor por **nombre comercial** depurado, marca, canon,
fechas, resumen por tipo con la tarifa sólo como sí/no, proveedores,
movimientos, **oportunidades** y **recomendaciones**); §5.3 (b) perdió "ningún
contrato, ningún espacio" y quedó como la lista taxativa de arriba; §5.3 (c) y
(d) suman el detalle a los accesos del reporte y a la bitácora; §3.6 (nuevo)
declara las finalidades, con **"mejora del servicio y de la plataforma"**
agregada a asesoría / salud de la cartera / cobranza. `VERSION_POLITICA` **NO
sube**: la v2 no se había desplegado y el titular consiente el trato completo en
un solo acto (§11 lo deja escrito en el historial, bajo la fila de 2026-09-v2).
Un `[VALIDAR CON ABOGADO]` nuevo pregunta por el contrato individual con nombre
de proveedor y por el benchmark cruzado entre clientes. La copia de
`frontend/src/legal/politica-datos.md` sigue byte-idéntica (test-enforced).

**El catálogo del reporte** (`app/plataforma_reporte.py::CATALOGO`) pasa de 22 a
**34 entradas**: 12 nuevas con `endpoints: ["detalle"]` — `espacio_codigo_y_tipo`,
`espacio_estado`, `contrato_proveedor` (saneado), `contrato_marca`,
`contrato_canon_mensual`, `contrato_fechas`, `resumen_por_tipo`,
`proveedores_del_cliente` (saneado), `movimientos`, `benchmark_plataforma`,
`oportunidades` y `recomendaciones`. `"detalle"` es un valor válido más de
`endpoints` (junto a `metricas` / `tendencia` / `adopcion` / `reporte`). El enum
de `finalidad` NO cambia (`asesoria|salud_cartera|cobranza`, que es como lo tipa
el frontend): las 12 van con `asesoria`, y la finalidad nueva de la política vive
en el documento. `_accesos_del_cliente` gana la rama
`accion == "detalle"` → alcanza si `periodo` empieza con `"<slug>:"`, así que la
consulta del detalle aparece en el reporte de transparencia del titular.

**El frontend**: página `/plataforma/clientes/:slug` (operador) con
**Recomendaciones primero** (es "qué le propongo hoy"), luego Oportunidades,
Espacios (filtrable por sede, tipo y estado, con buscador), Por tipo,
Proveedores y Movimientos; botón **"Imprimir recomendaciones"** que reusa la
vista imprimible del reporte de Fase 7 (`@media print`); enlace **"Ver detalle"**
en cada fila de la tabla de `/plataforma` y enlace al reporte de transparencia
del cliente. Primitivas de `components/plataforma/consola.tsx`, tokens `--con-*`,
claro y oscuro, sin librerías nuevas, bajo la CSP.

**Gotcha heredado de la Fase 7** (vale también para este endpoint):
`test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint` barre el
OpenAPI entero con el token de montaje y necesita un valor para cada parámetro
de ruta en su diccionario `relleno`. `slug` ya está ahí desde el cierre de la
Fase 7, así que `GET /api/plataforma/clientes/{slug}/detalle` queda barrido
solo; un parámetro de ruta NUEVO sin su relleno hace fallar la suite entera a
propósito.

### Fase 9 — Landing pública

**El problema (dueño, 2026-09-05).** Al abrir `retail-espacios.onrender.com`
lo único que había era el formulario de ingreso: nada decía qué es RECABRA,
para quién es ni por qué registrarse. La landing tiene que vender el sistema
y llevar al registro en 30 segundos.

**Ruteo.** Sin sesión, `App.tsx` resuelve en este orden y el orden es
vinculante: `/politica-datos` → enlace de montaje (`/?montar=…&t=…`, que
apunta a la RAÍZ, `routers/spaces.py`) → `/` = `Landing` → **cualquier otra
ruta = `Login`** (así un enlace guardado a `/reporte-plataforma` aterriza ahí
después de entrar). Con sesión, `/` sigue siendo el tablero o `/plataforma`.
`/login#registro` abre `Login` en modo registro; es el destino de los dos CTA
«Crear mi cuenta». `/login?invitacion=…` no se tocó (el canje sigue en el
backend). Sin backend nuevo: `/` es el mismo cascarón del SPA; no hay ningún
`/api/landing/*` (barrido de la tabla de rutas en `test_landing_ataques.py::l13`).

**Orden de trabajo (indicación del dueño, `features/landing/spec.md`).**
Copy primero (`outputs/copy.md`: texto final sección por sección, cifras con
archivo de origen en §12, datos de ejemplo en §13, 28 «no prometemos» en §14),
después diseño **sin referencias visuales** —sólo copy y spec, sin capturas ni
paleta—, y recién después frontend con lo funcional heredado (rutas, CSP,
three.js perezoso) y la estética del diseño nuevo. Lo que choca con la
aplicación interior se documenta como decisión del dueño, no se suaviza.

**Lo que se construyó.** `src/pages/Landing/`: `Landing.tsx` (nueve secciones
con el copy literal), `landing.css` (tokens y componentes **todos bajo `.lp`**:
redefine `--bg`, `--surface`, `--ink`, `--accent`, `.card`, `.nav`, `.btn` que
`src/index.css` ya usa; `probar-landing.mjs` falla si un selector se escapa),
`datos.ts` (supermercado inventado: 2 sedes, 16 alquilables 7/3/6, ~30 muebles
de contexto, prefijos de `nomenclatura.ts`, proveedores inventados — nunca
reemplazar por marcas reales), `PlanoIsometrico.tsx` (SVG propio, proyección
2:1, paneo/zoom como un solo `transform` por `ref`; la rueda sola siempre
scrollea la página y el zoom por rueda pide Ctrl/⌘ (ver gotcha abajo); teclado completo; ficha con el orden de copy
§11.2; leyenda con la palabra al lado del color; tabla equivalente; límite de
error) y `Vista3D.tsx` (three.js, **escena mínima propia, NO `StoreEditor3D`**,
que arrastra fiber/drei/store/API; entra por `lazy(() => import(...))`, se
pinta a pedido, libera renderer al desmontar). SEO en `index.html` servido en
el HTML: title, description, robots, `og:*`, `twitter:card`. Tema claro/oscuro
por `data-lp-tema` con preferencia guardada; `prefers-reduced-motion` respetado.

**Diseño «Planta y tinta»** (`outputs/diseno.md` + `outputs/prototipo/`): la
página es un plano — papel cálido `#F7F4EE`, tinta, retícula isométrica,
tipografía del sistema (cero descargas, por eso cumple la CSP sin tocarla),
ultramar `#3A34D6` como único color de acción porque verde/ámbar/rojo ya
significan estado. Estados validados con el validador de `dataviz` en claro y
oscuro. Sólo Ocupación lleva cifra en «los números que vas a tener a la
vista»; las otras cuatro, rótulo sin número: es la prueba visual de que nadie
promete «+30 %».

**Cifras del copy, todas con origen.** Recordatorios 30/15/6
(`services/reminders.py`, no 30/15/7); enlace de montaje 30 días (`auth.py`);
planilla 300 filas (`bulk_leases.py`); «Renovar» a ≤ 60 días; 9 temporadas
(`types/seasons.ts`); 15 tipos con tarifa (`fixtures.ts`); desvío desde 1 %;
`$ 1.500.000 × 61 días = $ 3.050.000` (este documento); ocupación de ejemplo
35 % = 8 de 23 caras. Regla: si un número no está en copy §12, no se escribe.
La sección de Asesoría NO promete un panel dentro de la cuenta del
supermercado: las recomendaciones salen de la consola del operador y llegan
por la sesión de asesoría, y la landing lo dice junto al reporte de
transparencia. Las capturas de `features/*/outputs/capturas/` son de la
consola del operador con un cliente de prueba y no van en la landing.

**El armazón cambió.** La landing no importaba three, pero `main.tsx → App.tsx
→ Dashboard → StoreEditor3D` lo metía en el chunk principal y el visitante
anónimo bajaba el motor 3D y Firebase antes del titular (hallazgo H-1 del
auditor). Por eso **todas las pantallas de adentro entran por `React.lazy`**
con una frontera `Suspense` en `App.tsx`. Build: `three.module-*.js` 732 kB
en chunk propio, `Dashboard-*.js` 1.058 kB aparte, `index-*.js` 300 kB.

**Verificación (2026-09-06).** `tsc` limpio; `build` limpio; suite completa
verde dos veces en serie (990 pruebas, 1 saltada, 7 xfail); 21 pruebas propias
(`npm run probar:landing`, render con `react-dom/server`), 11 de rutas
(`test_landing.py`) y 28 del red team (`test_landing_ataques.py`: cero API,
cero sesión, cero red, cero clientes reales, cero recursos externos, CSP
directiva por directiva, los nueve enlaces que circulan devuelven el mismo
cascarón, orden de guardas, grafo estático sin three). En navegador: 0
peticiones a `/api/`, 0 violaciones de CSP, 0 errores; three sólo baja al tocar
«Ver en 3D». **LCP en Slow 4G: 3,42 s** (objetivo < 2,5 s; en 4G rápido 1,8 s):
lo que pesa es el chunk de entrada y la hoja de fuentes de Google de
`index.html` que la landing no usa. Capturas 360/1440 × claro/oscuro en
`features/landing/outputs/capturas/`.

**Pendientes al cierre de la fase** (detalle en
`features/landing/outputs/ENTREGA.md`): recorte horizontal a 360 px por
`min-height: 300px` + `aspect-ratio` en `.mesa__stage` (`landing.css:285`);
LCP en 4G lento; `frontend/public/robots.txt` (hoy `/robots.txt` devuelve la
landing en HTML); anclas `#transparencia`/`#derechos` muertas porque
`markdownLite` no emite `id`; `og:image` 1200×630; el copy del atraso no cuenta
el escalón `suspendido`; los siete `[COMPLETAR]` (precio, unidad, correo de
contacto, razón social, NIT, ciudad, correo de protección de datos) y el
`mailto:` vacío de «Hablemos». Decisiones del dueño: `/login` no se parece a
la landing (papel cálido + ultramar + sistema vs. papel frío + tinta + Chivo);
los cuatro colores de estado son el mismo lenguaje pero no los mismos hex que
`index.css`; dos sedes o una; diagramas o capturas en «Cómo se usa».

**Pendientes conocidos de la fase:**

- **LCP en 4G lento**: 3,42 s medidos (objetivo < 2,5 s); en 4G rápido 1,8 s.
  El elemento LCP es el párrafo del hero y el costo es el entry de la app
  (~294 kB) más la hoja de fuentes de Google en `index.html`, que bloquea el
  pintado. Palancas: inyectar la hoja de fuentes por JS sólo en las pantallas
  de adentro y bajar el entry. No bloquea el merge; sí conviene antes de
  pautar la página.
- **`og:image`** falta (1200×630 desde el plano de ejemplo).
- **`markdownLite` no emite `id` en encabezados**: toda ancla `#…` hacia
  `/politica-datos` aterriza arriba.
- **Siete `[COMPLETAR]`** visibles en la página (precio, unidad, correo de
  contacto, razón social, NIT, ciudad, correo de protección de datos): sin
  ellos la página no se pauta, aunque ya se puede desplegar.
- Resueltos al cierre: el recorte a 360 px (`min-height: 0` en móvil),
  `/robots.txt` estático, el escalón `suspendido` en el copy del precio.

### Landing — re-vestido a la dirección E («La fusión»)

El dueño eligió, entre las cinco direcciones del taller de diseño, la **E**
(`features/landing/outputs/opciones/E-fusion/`): estructura y densidad de C con
el gesto de A concentrado donde vale. La landing de la Fase 9 («Planta y
tinta», papel cálido + ultramar) quedó **reemplazada**; lo funcional se
conservó entero. Lo que cambia respecto de lo escrito más arriba en esta misma
sección:

- **Ocho secciones**, no nueve: hero, lo que hace, para quién, cómo se arranca,
  asesoría, datos, precio, cierre. Entre ellas, conectores que nombran el
  título **literal** de la siguiente.
- **Estética:** fondo `#04070A` (el oscuro es el modo de la casa; el claro está
  entero y a un clic), **amarillo de etiqueta de precio `#FFD028` como único
  color de acción** —ya no el ultramar—, display de sistema con peso 800 y
  monoespaciada con cifras tabulares para códigos, plata y fechas. Los cuatro
  estados siguen siendo los hex validados con `dataviz` (oscuro `#00BE86 ·
  #F5A524 · #F4544E`; claro `#00805A · #CE8A0A · #D8342E`).
- **El plano ya no vive en una tarjeta del hero:** es una **sala pegada**
  (`position: sticky`, 100 dvh) que ocupa el hero y «Lo que hace», con la
  **cámara guiada por el scroll** (lerp 0,14 sobre un único `transform`, mapa
  de nueve escenas en `PlanoIsometrico.tsx`). Sobre el propio plano salen las
  capas de prueba ancladas al mueble del que habla cada tarjeta.
- **Motor nuevo del plano**, portado de E: una sola proyección con parámetro
  (`motor.ts`), donde «Ver en 3D» **no dibuja otra escena** sino que baja el
  horizonte y sube los muebles interpolando 760 ms. El `React.lazy` de
  `Vista3D` (three.js) **sigue existiendo y sigue siendo el único camino a
  three**: se abre desde «Recorrerla», el botón que aparece dentro de la vista
  3D. El bundle inicial de `/` sigue sin un byte de three.
- **`prefers-reduced-motion` no apaga nada:** deja la cámara quieta (los
  encuadres cambian de golpe), las capas de prueba aparecen igual y «Cómo se
  arranca» se lee como tres pasos con la sala ya dibujada y pintada.
- **`datos.ts` se rehízo con la constante `PIEZAS` de E:** 45 piezas, 16
  alquilables (10 CENTRO / 6 PALMAS) y 29 de contexto, mismo reparto 7/3/6 y
  los mismos proveedores inventados. El supermercado **no se nombra**: el
  nombre que propone `copy.md` §13 ya identifica a un cliente en la consola del
  operador y `test_landing_ataques.py` §L05 lo prohíbe en una página pública.
- **No cambió nada de lo que sostiene la fase:** cero `/api/*`, cero sesión,
  cero red, cero recursos externos, todo el CSS bajo `.lp`, `/login`,
  `/politica-datos`, el deep link de montaje y la redirección de quien ya tiene
  sesión intactos. `test_landing.py`, `test_landing_ataques.py` y
  `npm run probar:landing` siguen verdes (de este último se actualizaron dos
  asserts: el titular es ahora «Recabrá cada metro.» con el titular viejo de
  subtítulo, y el enlace de salto apunta a `#contenido`).

- **Gotchas de producción (dueño, 2026-09-06):** (1) Chrome pone
  `outline: auto 5px` a cualquier elemento SVG con foco —también por clic, no
  solo `:focus-visible`— y lo dibuja en unidades del plano: con la cámara a ×19
  salía un aro blanco que tapaba el mueble elegido. `landing.css` apaga el
  `outline` en `.pieza:focus`; el foco visible es el `.pieza__ring` amarillo.
  (2) «Armar» la rueda con el clic hasta que el mouse saliera del plano
  secuestraba el scroll, porque el plano pegado ocupa toda la pantalla. Ahora
  la rueda sola siempre scrollea; el zoom por rueda es Ctrl/⌘ + rueda (la
  pinza del trackpad manda `ctrlKey` sola), más los botones y la pinza táctil.
  (3) Tocar un mueble «congelaba» el plano: un clic con 4 px de movimiento
  (mouse real, dedo) contaba como arrastre y dejaba la cámara «libre» para
  siempre, fuera de las escenas del scroll. Ya no existe la cámara libre
  permanente: la cámara de cada sección SIEMPRE retoma el plano al cambiar de
  sección (un arrastre o zoom a mano vale hasta la siguiente), y el umbral de
  arrastre subió a 10 px. El clic y la ficha se conservan.
  (4) La ficha del mueble tapaba la capa de prueba de la sección (p. ej. la
  tira de temporadas). Ahora la ficha solo existe en el inicio (escena
  `hero`); en las specs, señalar o tocar un mueble deja el anillo y el
  código, sin ficha. Al volver arriba, la ficha vuelve.
- **Gotcha al cerrar (verificador de fidelidad):** `src/index.css` define una
  clase global `.rotulo` (versalita mono 600, 9,5 px) que pisaba el pill del
  plano; `landing.css` la redeclara entera (`font-weight`, `text-transform`).
  Lo mismo con el preflight de Tailwind: los `h4` y el `padding` de los botones
  se declaran explícitos. La sala de «Cómo se arranca» ajusta su `viewBox` a la
  caja real (como E) en vez del 640 × 300 fijo, que la dejaba un cuarto más
  chica.

Detalle de qué se portó tal cual, qué se adaptó y qué quedó distinto de E en
`features/landing/outputs/frontend-E.md`.

### CI en GitHub: por qué estuvo rojo en `main` (#48 → #49) y cómo se arregló

Los merges de #48 y #49 dejaron **rojo** el job «Backend · pytest» de `main` sin
que nadie lo viera (se mergeaba mirando la suite local, verde). Cuatro fallos,
todos de tests, ninguno del producto — y ninguno reproducible local:

- `test_a9`: comparaba dos respuestas enteras de `/adopcion` y `generado_en`
  cambió de segundo entre llamada y llamada. Ahora se compara sin el reloj.
- `test_t53`: el 404 genérico dice «Not Found» con httpx 0.27 (el pinneado en
  `requirements-dev.txt`, que no normaliza `..` en el path) y «Not found» (el
  catch-all de la SPA) con httpx 0.28 (el local). El test acepta los dos.
- `test_ingresos_12`: hace `git show 6dd2f4c:…` y el checkout de Actions es
  superficial (`fetch-depth: 1`), así que el commit no existía. El job del
  backend clona con `fetch-depth: 0`.

**Regla:** antes de mergear, mirar los checks del PR en GitHub, no solo la
suite local; y después del merge, el run de `main`.

### Pendientes conocidos: clientes y plataforma

- **R-3 (menor)**: el tope de 2 fundaciones es count+insert sin barrera en la
  base — una carrera perfecta podría fundar de más. `UNIQUE` solo cubre
  repetir el mismo slug.
- **R-4 (menor)**: si `crear_cliente()` falla tras el commit intermedio (que
  suelta el candado de SQLite), queda un `Usuario` sin membresía ni fundación.
  No da acceso a nada; es fondo de tabla.
- **R-5 (latente)**: `crear_cliente` adopta una base `recabra_<slug>`
  preexistente en vez de rechazarla. Hoy inalcanzable (producción se llama
  `retail_espacios`); es un renombre de base de distancia. Test xfail que lo
  documenta.
- Un login legado rechazado por suspensión no deja línea en la bitácora.
- Un estado desconocido escrito a mano en `estados_cliente` **falla abierto**
  (pasa como activo): no cortarle el servicio a quien paga ante un valor que
  el código no entiende.
- El estado se refresca al **entrar**: un cambio a mitad de sesión se ve en el
  próximo login (el 402 puntual de cada mutación sí llega igual).
- El cache del estado es de 60 s; el PATCH del operador lo invalida — mover la
  fila a mano en la base no.
- **Para el abogado, abiertas por la Fase 8** (marcador nuevo en §5.3, además de
  las heredadas de la Fase 7 —agregado sobre un solo contrato, relación
  canon/tarifa sin umbral, proveedor unipersonal, fecha de último acceso, día de
  aceptación—): **(1)** si el **contrato de encargo** del §5.2 y la finalidad de
  asesoría alcanzan para que el operador lea el **canon y las fechas de un
  contrato individual** junto al **nombre comercial** del proveedor —dato
  comercial del supermercado y, a la vez, de un tercero que puede ser persona
  natural— o hace falta una cláusula/autorización adicional; **(2)** si el
  **precio sugerido calculado sobre el promedio de toda la plataforma** —un solo
  número por tipo, sin nombres ni desglose— queda cubierto por el contrato de
  servicio como estadística agregada o hay que pactarlo expresamente, y si esa
  disociación alcanza cuando hay pocos clientes con ese tipo de espacio;
  **(3)** la **marca** exhibida como dato de un tercero; **(4)** el plazo de
  retención de `bitacora_plataforma`, que sigue en `[COMPLETAR]` en el §6 de la
  política y ahora guarda también las consultas de detalle.

### Pendientes conocidos: identidad

- **Firebase no se consulta por revocación**: una cuenta deshabilitada en la
  consola de Firebase puede canjear su ID token vigente (≤1 h) por un JWT
  propio de 12 h. Mitigado de verdad por el chequeo de membresía por request:
  desactivar la membresía acá corta el acceso ya. Deshabilitar en Firebase
  SIN desactivar la membresía no corta nada — el procedimiento es desactivar
  la membresía.
- **El email del actor va concatenado en `detalle` del `audit_log`**
  (`… · correo@x.co`), no en la columna `actor` (que sigue diciendo el rol).
  Funciona pero obliga a parsear texto; una columna nueva pediría migración o
  tabla aparte — decisión pendiente.
- Los caminos del SDK de Firebase en el cliente (alta por correo,
  verificación, reset) no tienen tests automatizados: el repo no tiene runner
  de tests de frontend. El backend sí está cubierto (identidad + ataques).


### Clientes: alta self-service y estado de cuenta (Fase 2)

Dos cosas nuevas, construidas sobre la Fase 1: un supermercado se puede
fundar solo, y la plataforma tiene un interruptor de estado de cuenta por
cliente que un operador mueve a mano.

**El alta** (`POST /api/clientes/alta`, `app/routers/alta.py`) recibe el
`id_token` de Firebase **directo**, sin JWT propio — un usuario sin
membresías no puede tener uno (`/oauth` le da 403), así que no hay JWT que
pedirle. La misma vara de correo confiable que `/oauth` (verificado, o el
proveedor es Google) y las mismas reglas de vinculación de `Usuario` (por
`firebase_uid`, si no por email, nunca se crea uno nuevo si el email ya tiene
fila). El freno de fuerza bruta es una tabla propia (`alta_attempts`, vía
`IntentoAlta`) para no contaminar ni `login_attempts` ni `intentos_oauth`.
`crear_cliente(slug, nombre)` —que ya existía— es el paso **irreversible**:
crea la base de Postgres. Por eso TODA la validación va antes — slug con la
misma forma que exige `crear_cliente`, lista de reservados
(`galerias`, `api`, `plataforma`, …), verificación directa de que el slug no
existe (activo o no: `buscar()` filtra inactivos y dejaría estrellar el
UNIQUE), y el tope de **2 clientes fundados por usuario** (tabla
`fundaciones`) — así que "sin cliente a medias" es literal: si algo falla,
no queda una base a medio crear.

**Estado de cuenta sin tocar `clientes`.** La tabla nueva `estados_cliente`
(base registro, `create_all` la crea sin migración) vive **al lado** de
`clientes`, no adentro: **fila ausente = activo**, y una fila con
`estado="activo"` también es activo (el PATCH la deja puesta como constancia
de quién hizo el último cambio, incluido reactivar). Por construcción,
galerías y todo cliente que ya existía hoy quedan activos sin ninguna
acción — cero backfill, cero fila que escribir.

**El interruptor vive en un solo lugar**: `_aplicar_estado`, adentro de
`cliente_del_pedido` (`clientes.py`), el único punto por el que pasan todos
los routers de negocio. Semántica: `activo`/`gracia` pasan; `solo_lectura`
deja pasar GET/HEAD/OPTIONS y corta el resto con 402; `suspendido` corta
todo, GET incluido. Dos exenciones explícitas, a propósito:
- **`/api/plataforma/*` siempre pasa** — opera sobre el registro, no sobre
  la base del cliente, y un operador cuyo propio cliente quedó degradado
  tiene que poder seguir destrabando cuentas, incluida la suya.
- **`/api/auth` y `/api/usuarios` pasan en `solo_lectura`** — el owner
  necesita poder entrar y gestionar su gente para poder pagar (spec, decisión
  3). En `suspendido` NO hay excepción para estos dos: el corte ahí es total.

`/api/auth/login` y `/api/auth/oauth` **no pasan por `cliente_del_pedido`**
(resuelven su propio cliente antes de que exista ningún token), así que el
gating de esos dos vive aparte, explícito, en `routers/auth.py` — mismo
`estado_de()`, mismos códigos, pero cada uno con su propio motivo: el legado
comprueba la contraseña ANTES de mirar el estado, para que la pantalla de
ingreso no se convierta en un oráculo de qué supermercados dejaron de pagar
con solo probar slugs.

**`expire_leases()` sigue andando en `solo_lectura` a propósito.** El corte
es al **pedido HTTP**, no a la sesión de base: un `GET /api/spaces/map` que
pasa el filtro (es lectura) puede seguir disparando por dentro la escritura
que vence contratos vencidos — si el corte viviera en la sesión, ese mismo
GET se caería al intentar escribir. Es la sutileza central del contrato de
esta fase, y tiene test dedicado
(`test_solo_lectura_no_rompe_el_get_que_escribe_por_dentro`).

**Operador de plataforma** = email en la env `OPERADOR_EMAILS`
(coma-separada), sin distinguir mayúsculas, sin tabla de superadmins que
alguien pueda escribir — se lee de la env en cada llamada. Sólo aplica a
cuentas con `sub`: el login legado nunca trae `email` en el token, así que
`request.state.actor_email` queda ausente y `require_operador` da 403
siempre, por construcción, sin ningún chequeo especial para el legado.
`GET /api/plataforma/clientes` y `PATCH /api/plataforma/clientes/{slug}`
(motivo obligatorio, también al dejar "activo") sólo tocan el registro:
nunca abren la base de negocio de un cliente.

Config: `OPERADOR_EMAILS` sin poner deja el panel de operador inexistente
para todos — no hay 500, cualquier cuenta con `sub` simplemente da
`operador: false`.

#### Pendientes conocidos: clientes

De la auditoría de regresión y del red team
(`features/clientes/outputs/regresion-fase-2.md`,
`features/clientes/outputs/red-team-privilegio.md`):

- **La suite completa de pytest sólo está verde la primera vez que se corre
  sobre un checkout** (hallazgo R-0, encontrado por duplicado y sin
  coordinación por el auditor de regresión y por el red team).
  `tests/test_correo_api.py` —pre-existente, ajeno a esta fase— importa
  `app.services.mailer` a nivel de módulo; pytest colecciona (importa) todos
  los archivos de test antes de correr ningún fixture, así que ese import
  deja `app.database` clavado contra su default
  (`sqlite:///./retail_espacios.db`, un archivo real en `backend/`) desde
  ANTES de que el fixture `client()` del primer test ponga el
  `DATABASE_URL` de prueba. Sólo el primer test de toda la sesión paga esto
  (la purga de `sys.modules` corre en el teardown, protege del segundo test
  en adelante). Antes de esta fase era inofensivo porque nada revisaba
  estado persistente; desde que el primer test alfabético del repo es
  `test_alta.py::test_alta_feliz_funda_owner_y_base_vacia` —que funda un
  cliente real llamado `nuevomarket`— la segunda corrida sobre el mismo
  checkout arranca en rojo (409, el slug ya existe) o, si dos procesos
  comparten el mismo directorio, con `readonly database`. Antes de medir
  regresión sobre esta rama: `rm -f backend/retail_espacios.db
  backend/recabra_*.db`. Arreglo de una línea, fuera del territorio de los
  tres builders de esta fase: mover el import de `test_correo_api.py`
  adentro de sus funciones, como hace el resto de `tests/`.
- **El 402 del interruptor se contesta sin credencial** (R-1, mayor): en una
  instalación de un solo cliente, `cliente_del_pedido` resuelve por `unico()`
  antes de que `require_auth` mire el token, así que un `GET` anónimo
  distingue 401 (cuenta sana) de 402 (degradada/suspendida) — exactamente el
  oráculo que el login legado se cuidó de no construir. Sugerido: que
  `_aplicar_estado` sólo corra cuando el pedido trajo credencial.
- **`aviso_cuenta.motivo` en `gracia`/`solo_lectura` le llega a cualquier
  rol**, worker incluido — a diferencia de `suspendido`, donde el motivo ya
  está protegido para el owner solo. Es texto libre que el operador escribe
  para uso comercial (facturas, con quién hablar), no para la trastienda.
- **El tope de 2 fundaciones por usuario no tiene barrera en la base**: dos
  altas simultáneas del mismo usuario pueden ganarle la carrera al `count()`.
  El UNIQUE existente evita fundar el mismo slug dos veces, no evita fundar
  un tercer cliente distinto.
- **Un alta que falla en `crear_cliente` deja un `Usuario` huérfano** (sin
  membresía ni fundación): el commit que suelta el candado de SQLite antes
  del paso irreversible también graba el usuario. No abre nada (`/oauth` le
  da 403 igual), pero contradice "sin cliente a medias" en sentido estricto.
- **`crear_cliente` no distingue crear una base de adoptar una que ya
  existe**: si una base `recabra_<slug>` de la misma instancia de Postgres
  no tiene fila en `clientes`, el alta le mete las tablas de RECABRA adentro
  y el fundador nace admin ahí. Hoy no es alcanzable (la base de producción
  se llama `retail_espacios`, no hay `recabra_*` huérfanas), pero el
  `recabra_nuevomarket.db` que deja la propia suite de tests al correr es
  exactamente ese escenario en miniatura.

### Sincronización entre computadores

El síntoma era "lo que hago acá no se ve allá". Eran varios defectos encadenados, todos
corregidos:

- `syncFromServer()` corría al cargar el módulo, **antes del login**: sin token daba 401,
  el interceptor borraba la sesión y nunca se reintentaba. Ahora arranca desde `App.tsx`
  con la sesión activa.
- El merge decidía por **cantidad** de fixtures, así que las eliminaciones nunca
  viajaban. Ahora manda la revisión (`updated_at`).
- Un único timer de guardado global para todas las sedes; ahora hay uno por sede.
- Sin revalidación tras la carga inicial. Hay polling de revisiones cada 20 s y refetch al
  recuperar el foco, al mostrar la pestaña y al reconectar.
- La lista de sedes y las etiquetas del catálogo vivían solo en `localStorage`. Ahora se
  comparten server-side y la lista visible es la **unión** de la configurada y de toda
  sede con snapshot, para que ninguna con datos quede oculta.
- Los fallos eran silenciosos mientras la UI decía "✓ Sincronizado". Hay un indicador real
  en el header y resolución explícita de conflictos.

Endpoints nuevos: `GET /layout/revisions` (polling barato), `GET/PUT /layout/settings`,
`DELETE /layout/{sede}`. El `PUT` acepta `base_updated_at` y responde 409 si otro equipo
guardó en el medio.

### Muebles comercializables

Campo opcional `rentable` en `UnifiedFixture`, con semántica retrocompatible: **ausente
significa comercializable**, solo un `false` explícito marca infraestructura (helper
`isRentable`). Columnas, cajas y zonas libres nacen como no comercializables.

Un mueble no comercializable no admite contrato (también bloqueado server-side con 409),
queda fuera de todas las métricas de disponibilidad y se dibuja en gris pizarra.

### Dashboard

KPIs arriba de todo, mapa isométrico y columna de "Atención" lado a lado, un solo buscador
para toda la página, y vista propia para el rol worker (arranca por espacios disponibles y
lo que vence, sin nada de dinero).

Al hacer clic en un mueble se abre un popover anclado a él; "Ver todo" pasa el detalle
completo a la columna derecha. Los campos vacíos no se dibujan.

### Paleta y tipografía

El sistema visual sale de `docs/maquetas/` y vive en `frontend/src/index.css` +
`tailwind.config.js`, que repiten los mismos valores (literales en Tailwind y no
`var(--x)`, porque media docena de clases usan el modificador de opacidad y Tailwind
sólo sabe separarle el alfa a un color que puede leer). **Si tocás uno, tocá los dos.**

**Tres estados y nada más.** Verde se puede vender, naranja a medias, rojo no:

| Lectura | Color | Token |
|---|---|---|
| Libre todo el periodo | verde `#00786A` | `--libre` |
| Se libera en el periodo | naranja `#F08519` | `--entra` (texto: `--entra-txt` `#B35F0A`) |
| Tomado | rojo oscuro `#8E1226` | `--ocupado` |
| Resto de la sala | gris `#D3D9DB` · `#E4E8E9` | `--resto` |

El rojo es **oscuro a propósito**: cuando el tono se colapsa bajo deuteranopía lo que
separa es la luminosidad, y un rojo claro contra un verde medio se vuelven el mismo
bloque. Medida con la misma cuenta, esta terna separa mejor que la que estaba desplegada
en TODOS los pares — el peor par pasa de 13,5 a 19,9 en dicromacia y de 27,4 a 33,8 en
visión normal. Cada estado va **siempre rotulado**, así que la identidad nunca depende
sólo del color.

`success` / `warning` / `danger` apuntan a esos mismos tres. Acá no quieren decir «bien /
cuidado / error»: quieren decir libre, se libera, tomado.

**El plano pinta siempre esa escala de tres.** Antes, sin periodo elegido, contestaba con
la otra —«qué pasa hoy», siete clases— y ahí `free` contra `maintenance` daba ΔE 3.6 en
deuteranopía: el mismo color para dos estados opuestos. La salida no fue inventarle un
color a nadie sino sacarle el trabajo al color: **«Hoy» pasó a ser un periodo de un día**
(`hoyComoRango()` en `SeasonPicker`), las dos pantallas tienen siempre periodo puesto, y
el detalle por estado vive **escrito** en la tabla, donde cada fila lleva su palabra.

**Tipografía: Chivo + Archivo Narrow.** Chivo para leer; Archivo Narrow para códigos y
versalitas. Cada mitad hace algo que la otra no puede: Chivo tiene un 900 de verdad —no
un 700 engordado— y sobre ese peso se apoya el único número grande de la pantalla, el
total del contrato; Archivo Narrow aprieta `GON-60·A` en una columna de 56 px, y de eso
depende que las 23 caras entren sin cortar un código. `--font-mono` sigue llamándose así
por los ochenta lugares que la piden, pero **no es monoespaciada**: lo que hacía falta de
un mono era que las cifras alinearan, y eso lo da `tabular-nums`, que está en el body.

**Siete tamaños y ninguno más** — 9.5 · 11 · 12 · 13 · 14.5 · 17 · 27 — escritos en
`index.css`. Había diecisiete, que es lo que hace que una pantalla se vea armada de a
pedazos. El contraste lo dan la familia, el peso y el color, no el tamaño. Radios: 2 px
para lo que se toca, 3 px para el panel. Sin sombras salvo el modal.

**Antes de mover un color hay que volver a correr la cuenta** sobre los cinco del plano
—los tres estados, el cuerpo del mueble y lo no comercializable—. Que «se vean distintos»
no es evidencia.

### Tarifa de referencia y rendimiento $/m²

Eran los dos primeros del backlog; salieron juntos porque comparten dominio (dinero).

- **Tarifa de referencia** por tipo de mueble: una general + ajuste opcional por sede
  (`app_config`, clave `layout_reference_rates` — sin migraciones, como manda la regla).
  Se edita desde el botón **Tarifas** del Dashboard; guardado automático con el mismo
  debounce que las settings. La tarifa de góndola es **por cara** (doble y mural
  comparten tarifa, porque el valor negociado también es por cara).
- Endpoints `GET/PUT /layout/rates`, declarados antes del catch-all. A diferencia de
  `/layout/settings`, acá **también el GET exige admin**: es dinero. En el cliente las
  tarifas nunca tocan `localStorage` y un login de worker las deja en `null`, así que
  una máquina compartida no filtra nada.
- En los paneles de contrato (2D y 3D) el campo de valor muestra la referencia del
  tipo+sede y el desvío (`−17% vs referencia`, ámbar por debajo / verde en línea o
  arriba).
- En el Dashboard admin: sección **"Bajo tarifa de referencia"** en Atención, con el
  desvío y `pagado · ref` en compacto.
- **No hay ranking de $/m²** y no debe volver: el precio se cuadra internamente, y además
  medía el plano equivocado. La industria mide anaquel en metros lineales y facings (el
  informe de la FTC de 2003 pide "linear feet" y "facings"; "square feet" no aparece), y
  la huella de piso es cero o casi cero para ristra, robatope y exhibidor cruz. La tarifa
  plana por mueble/sede sí es la convención real: la rate card publicada de Albert Heijn
  cobra por mueble, por tienda, por unidad de tiempo, sin mencionar área.
- El helper es `referenceRateFor(rates, sede, type)` y la clave de tipo
  `rateTypeOf()` (normaliza los tipos 2D legados `gondola_doble`/`gondola_mural` a
  `gondola`). Umbral de marcado: desvío ≥ 1 % — un peso de redondeo no es anomalía.

### Disponibilidad por fechas y calendario por temporada

Un contrato cargado para diciembre marcaba el espacio como ocupado **desde el momento de
guardarlo** y sumaba su valor al ingreso mensual. Lo peor no era el número sino la venta
perdida: el backend sí razonaba por fechas y aceptaba vender los meses previos, pero nadie
lo intentaba porque la pantalla decía "ocupado".

- La ocupación se **deriva** de `startDate`/`endDate`, que ya viajaban en el JSON del
  layout (`contractPhase`). Derivar en vez de guardar evita tener que correr algo que
  voltee el estado al llegar la fecha, y funciona sobre los planos ya guardados: sin
  migración ni backfill.
- Estado **"Contratado"** para lo firmado que aún no arranca: tarjeta, chip de filtro y
  color propio en el mapa (violeta claro). El ingreso mensual cuenta solo lo vigente; lo
  pactado va en su propia línea.
- El mapa pinta de **rojo lo vencido**, que la paleta ya pedía y no estaba implementado.
- `Space.active_lease` devuelve el contrato vigente HOY y se agregó `upcoming_lease`.

Sobre el mapa hay un control **"Disponible para"**: chips de temporada más dos campos de
fecha. Con un periodo elegido cambia la lectura entera — la leyenda pasa a tres estados
(libre todo el periodo / libre parte / tomado) y aparece el conteo de lo vendible. Las
tarjetas de arriba **siguen reportando hoy**, a propósito, y el encabezado del mapa dice
cuál contesta qué.

### Temporadas comerciales

Separación que hace que esto no se pudra: el **ancla** es un hecho del calendario y se
calcula (tercer domingo de junio, pascua por Meeus/Jones/Butcher, viernes tras el cuarto
jueves de noviembre); la **ventana de venta** —días antes y después— es decisión comercial
y se guarda en `app_config`, global para las tres sedes. El año entrante las anclas se
mueven solas y las ventanas siguen puestas. Se editan desde el ícono junto a los chips
(admin). `GET /layout/seasons` lo lee cualquier rol: son fechas, no dinero.

**Aritmética de días** (`types/seasons.ts`): todo pasa por un entero calculado con
`Date.UTC` sobre los componentes civiles, y el parseo de `"YYYY-MM-DD"` es propio —
`new Date(str)` lo toma como UTC y en Colombia retrocede un día. Los rangos son
**inclusivos en ambos extremos**, igual que el chequeo de solapamiento del backend: un
mueble necesita día de desmontaje. Un contrato de **un solo día es válido** (Black Friday
es un viernes suelto).

`reservado` y `mantenimiento` no tienen fechas: describen el presente. Bloquean un periodo
que incluya hoy, pero **no** uno enteramente futuro — bloquearlo escondería inventario
vendible detrás de una bandera puesta meses antes.

### Una pantalla de sede, dos modos

Había dos pestañas —**Negociar** y **Resumen**— que abrían las dos con el plano de la
misma sede y se diferenciaban en poco más que el orden de las tarjetas. La pregunta "¿en
cuál de las dos hago el contrato?" no tenía buena respuesta, y quien entraba a Negociar
elegía el espacio de **una lista de códigos**: `PUN-04` no dice si la punta está en la
entrada o contra la pared del fondo, y esa es media negociación.

Ahora es **una sola pestaña (Sede)** con un interruptor arriba que declara para qué está
abierta la pantalla:

- **Vender** — el mapa se lleva la pantalla, pintado por disponibilidad del periodo, y la
  ficha del contrato va al lado. Sin KPIs: para poner un precio no sirve la ocupación de
  hoy, sirve ver qué hay libre en el periodo y dónde queda.
- **Supervisar** — el tablero de siempre: KPIs, filtros por estado, mapa con el panel de
  Atención al lado y la tabla por espacio. Lleva un contador de pendientes en el
  interruptor, así que invita solo.

El mercaderista **no ve el interruptor**: no vende, y su pantalla es Supervisar.

**El periodo es uno solo.** La misma tira de temporadas que pinta el mapa llena después
las fechas del contrato, así no hay dos calendarios que puedan discrepar. Al entrar a
Vender se pone solo en hoy→30 días si no había ninguno: "hoy" no es una pregunta
comercial, lo que se vende es una temporada.

**El contrato** (`frontend/src/components/Contrato/`) está partido en un hook con el
estado (`useContrato`) y dos piezas para dibujarlo. El botón de guardar **no vive adentro
del formulario** sino en una barra pegada al pie de la pantalla, que resume de corrido lo
que va a quedar escrito —espacio → proveedor → valor → fechas— y dice qué falta antes de
que nadie busque el botón. Para algo que escribe plata, esa relectura vale el espacio.

Detalles que sobrevivieron de la pantalla anterior porque se ganaron el lugar:

- Las fechas vienen **ya puestas** con el periodo elegido arriba, y se congelan al abrir
  la ficha: cambiar la temporada mientras alguien teclea no le reescribe el acuerdo.
- El semáforo del encabezado (`Libre todo el periodo` / `Parte del periodo vendida`)
  responde por **las fechas que están escritas**, no por el periodo con el que abrió. Si
  se corre el "hasta" hasta pisar un contrato que ya existe, el aviso aparece ahí mismo.
- Debajo del valor va la comparación contra la **tarifa de referencia**.
- Al lado del código va **dónde queda** en palabras ("A unos 3 m de las neveras"), medido
  de borde a borde. El mapa está al lado, pero al teléfono con el proveedor hay que poder
  decir "es la punta de la entrada, no la del fondo".
- Una **góndola doble son dos espacios**: la ficha trae el selector de cara A/B.
- Un mueble no comercializable no abre contrato: la ficha explica que es parte del local.

Al guardar hace lo mismo que hacía el panel del plano —`find-or-create` del espacio y del
proveedor, `POST /leases`, y escribe el contrato en el JSON del layout— y muestra una
confirmación que **se queda hasta que la cierren**: al cerrar un trato lo que hay que ver
es a quién le llegó el aviso, y un mensaje que se va solo a los dos segundos no lo dice.
Esa confirmación vive en la pantalla y no en el formulario, porque al guardar el mueble
cambia de estado y eso desmontaba el mensaje justo cuando había que leerlo.

Desde **Supervisar** también se vende: el popover del mapa y el panel de detalle traen
"Negociar este espacio", que cambia de modo con ese espacio ya elegido.

#### Cómo quedaron las dos pantallas (las maquetas, en código)

Las maquetas de `docs/maquetas/elegida-vender.html` y `elegida-supervisar.html` bajaron a
código. Lo que cambió no es el aspecto: es **qué contesta cada pantalla**.

**El parte en prosa se fue de las dos**, y con él su maquinaria: `utils/parte.ts`,
`utils/redaccion.ts`, `components/Parte/` y sus dos suites no están en el repo. Eran
cuatrocientas líneas que no importaba nadie, y código muerto que sigue corriendo en CI se
lee como código vivo hasta que alguien pierde media hora averiguando que no lo es. Están
en la historia de la rama de diseño, que es donde hay que buscarlas si el parte vuelve.

**Supervisar** abre con una franja de cinco cifras: canon vigente, sin alquilar, vence en
30 días, ocupación, sin montar. «Sin alquilar» es la que faltaba —«ocupación 35 %» dice
que sobra sala, «$8.730.000 al mes a tarifa» dice cuánto vale esa sala— y lleva su tasa
por día, que dice **«por día vacío» y no «perdido»**: con el periodo por delante todavía
no se perdió nada. A un mercaderista la franja le cambia: ve *Vence en 30 días* y
*Libres* contados en espacios, nunca en pesos (el servidor ya le borra el
`negotiatedValue`, así que en pesos le llegaría un `$0` que hace parecer quebrada a la
sede).

«Atención» es ahora **«Para revisar»** y cada fila es un **botón que selecciona el espacio
en el plano de al lado**. Antes la lista y el plano eran dos paneles que no se hablaban.
«Los que más pagan» es **«Quién paga el canon»**, con el porcentaje del canon y el sello
VENCE: el ranking 1-2-3 contestaba una pregunta de vanidad; la que importa es de quién
depende la sede. **«Estado por espacio»** queda a todo el ancho debajo del plano, con los
chips de filtro en su encabezado —Todas / Por vencer / Sin montar / Libres, y el que no
puede devolver nada no se dibuja—.

Y el plano **deja de ser un directorio**: la tabla ya lista las 23 caras con su código, así
que arriba se rotula sólo la fila abierta. Veintitrés rótulos en un panel de 700 px caen a
un cuerpo ilegible. Lo no comercializable no se rotula nunca: es el contexto donde está lo
que se vende, y el contexto se dibuja.

**Vender** suma dos paneles. **«Cuándo se libera cada espacio»** (`components/Libera/`) es
una escalera sobre el eje de fechas con peine de días y un cursor que escribe la respuesta
—«si arranca el 26 de sep → 17 libres»—. Contesta la pregunta con la que se negocia una
fecha de arranque, que ninguna cifra suelta contesta: «15 libres» es cierto hoy y deja de
serlo el martes. **La serie no se asume monótona**: se cuenta día por día, porque un
contrato que arranca en el medio del periodo *baja* la disponibilidad y dibujarlo como una
subida sería mentir sobre inventario ya vendido. Los chips de código se apilan por columna
y sueltan los que no entran, en vez de dibujarse encimados.

**«Tarifa de referencia»** sale de atrás del botón y ocupa la columna derecha mientras no
hay espacio elegido —donde antes había 428 px de blanco reservado para lo que no estaba—.
Tocar una fila aísla esa familia en el plano. Abrir un modal para consultar un precio en
cada llamada es lo que hace que la gente termine con la lista impresa al lado del teclado.

La ficha del contrato lleva el espacio adentro de un recuadro propio con su tarifa —es el
único dato que no se teclea— y al pie el **TOTAL DEL CONTRATO**, que no existía: el
formulario pide el valor *mensual*, pero lo que se firma es el total del plazo, y
$1.500.000 al mes por 61 días son $3.050.000. Esa cuenta se hacía de cabeza con el
proveedor esperando. Debajo, las temporadas que el plazo cubre: argumento de venta y
control a la vez —si la temporada que se buscaba no aparece, las fechas están mal—.

#### El contrato multiespacio

Un contrato con un proveedor sobre tres puntas de góndola es **un solo acuerdo**
—un proveedor, un periodo, una firma— y hasta acá había que tipearlo tres veces, con
tres oportunidades de escribir una fecha distinta. Ahora la ficha lleva una lista.

- **La arma el plano.** Tocar un espacio lo suma al contrato; tocarlo de nuevo lo saca.
  Antes reemplazaba la selección. El plano marca todos los elegidos, y la cámara sólo se
  acerca cuando hay UNO: con dos o más, acercarse a uno esconde los que faltan tocar.
- **El valor va por espacio**, adentro de su renglón, y arranca con la tarifa de
  referencia escrita. La punta de la entrada no vale lo que la del fondo, y ése es
  justamente el detalle que se negocia; con el precio de lista puesto, bajarlo es una
  decisión que se toma mirando cuánto se está bajando. Al lado, el desvío contra la
  referencia, en el renglón del espacio que lo tiene.
- **Las dos caras de una góndola doble pueden ir en el mismo contrato.** Cada letra es
  un interruptor y no una opción: una marca que quiere el pasillo entero compra A y B, y
  con un selector entre las dos eso eran dos contratos.
- **El total es del plazo**, no del mes: $2.250.000 al mes por 61 días son $4.575.000.

**Se guarda por el camino de la tanda** (`POST /leases/bulk/confirmar`), el mismo que
usa la planilla, y eso no es comodidad de implementación. Por el camino de a uno cada
espacio dispara su propio juego de correos: un acuerdo sobre tres puntas le llegaba al
proveedor como tres confirmaciones, al comercial como tres contratos nuevos y al
mercaderista como tres órdenes. Nueve correos para una sola firma es exactamente lo que
hace que nadie los lea — y ese endpoint ya lo tenía resuelto («un correo por rol para
TODA la tanda»). De paso trae dos cosas gratis: **revalida** cada espacio contra la base
justo antes de escribir —entre que se armó el contrato y se tocó el botón, alguien pudo
haber vendido una de esas puntas desde otra sesión— y devuelve fila por fila qué pasó.

Hubo que agregarle dos campos a la respuesta, sin migración: `lease_id` por fila —la
planometría cuelga del contrato, así que la pantalla necesita su id, y va a **cada**
espacio porque el mercaderista abre el que le toca montar— y `avisos`, que dice a quién
se le encoló un correo. Ese segundo campo existe por la misma razón que existía en el
alta de a uno: cerrar la llamada creyendo que se le avisó al mercaderista, sin que haya
salido un correo, es el modo de falla que vuelve inútil la herramienta.

**Si un espacio falla, no se deshace nada.** Tres espacios son tres filas y la segunda
puede fallar con la primera ya escrita; deshacerla sería peor, porque el correo ya salió
y otra sesión pudo haberla leído. La confirmación dice exactamente qué quedó y qué no,
con el código a mano para reintentarlo.

**Lo que NO hace:** los N contratos quedan como N filas independientes en `space_leases`,
sin nada que los ate. No hay tabla de contratos —y la habría que agregar, no migrar, que
sí está permitido—. Mientras tanto la agrupación es **derivable**: mismo proveedor,
mismo desde, mismo hasta, misma sede. Cancelar sigue siendo de a un espacio.

#### El encuadre del plano

Tres cosas que salieron de mirar la pantalla desplegada y no de diseñarla.

**La tarjeta del plano no lleva alto: lo pone la PROPORCIÓN DEL PLANO.** Con alto fijo
—538 en Vender, 732 en Supervisar, que son los de la maqueta— el panel quedaba de
1450×430, una ranura de 3,4:1, y el plano de NAVE es de 1,7:1. `preserveAspectRatio`
lo encajaba por el alto y dejaba **el 55 % del ancho en blanco**: el dibujo se veía
chico y lejos, con medio panel vacío alrededor. La proporción no se puede fijar en el
código porque depende de la sede —una tienda larga y angosta y una cuadrada proyectan
distinto—, así que el lienzo la toma del `viewBox` de la escena, con un techo de 720 px
para que una sede casi cuadrada no empuje una tarjeta de mil píxeles y un piso de 360
para que una muy alargada no quede como una tira.

**En Vender la cámara ya no se acerca al mueble elegido.** No es una preferencia: ahí
tocar un espacio lo SUMA al contrato, así que el gesto siguiente es tocar otro — y
acercarse al primero esconde justamente los que faltan elegir. En Supervisar sí se
acerca, porque ahí se abre una fila de la tabla y la pregunta es dónde queda; pero el
tope bajó de 3,4 a 1,9 —a 3,4 se veían cuatro muebles y el resto de la sala quedaba
afuera— y el resto de la sala se apaga al 45 % y no al 20 %, que dejaba fantasmas.

**Las columnas miden lo que miden.** La fila es `flex-start` y no `stretch`: estirar la
tarjeta del plano para igualar la altura de la ficha le agregaba trescientos píxeles de
blanco debajo del dibujo. La única que se estira es la de la derecha, y sólo cuando no
hay ficha: si no, la lista de precios —unos 380 px— quedaba al lado de un plano de 700
y dejaba el fondo gris a la vista, que se lee como que falta algo. Estirada, la tabla
queda arriba y lo que sobra es hoja en blanco.

**La lista de precios dice CUÁLES.** «Isla · 3 · $1.200.000» dice cuántas quedan y no
cuáles, y para averiguarlo había que buscar los prismas verdes a ojo entre ciento seis
muebles. Debajo de cada tipo van los códigos de sus caras libres, como pastillas que se
tocan para sumarlas al contrato — la misma acción que tocar el mueble en el plano, por
el otro camino: el plano contesta «dónde queda» y la lista contesta «cuáles hay», y
según cuál de las dos preguntas traiga el proveedor uno arranca por un lado o por el
otro. Las que se liberan adentro del periodo van en naranja y con su fecha: es
inventario vendible —«te lo puedo dar desde el 25»— y esconderlo es dejar de ofrecer
cinco espacios de veinte. Con la ficha del contrato abierta los códigos se MUDAN de columna: la derecha
mide medio metro más que la izquierda y ese desnivel dejaba la esquina de abajo en gris,
así que van a la izquierda, debajo de la escalera, como panel propio —«Qué está libre»—.
Donde falta alto, que es también donde sirven: se sigue eligiendo espacios con el
contrato a medio llenar. A todo el ancho de esa columna las pastillas entran en una fila
por tipo y se leen de un golpe.

**Las dos columnas terminan a la misma altura**, y lo que absorbe la diferencia es
siempre el ÚLTIMO panel de la columna corta —la lista de precios a la derecha, la de
espacios libres a la izquierda—. Nunca la tarjeta del plano ni la escalera: ésas se
miden con su dibujo, y estirarlas les agrega blanco adentro.

**Cómo se mira sin backend.** `docs/maquetas/generadores/pantalla.mjs` sirve
`frontend/dist` y contesta `/api/*` con una sede sintética que lleva los ocho contratos
reales de NAVE. Lo que no está en el mapa de rutas contesta **404 y no `[]`** —así un
componente toma su camino de error en vez de recibir algo que parece un dato, que fue
exactamente el primer bicho que encontró—. Corre en tres modos: `admin`, `trabajador`
(replica lo que el servidor le borra a un mercaderista y verifica que **no le quede un
solo peso en pantalla**) y `ficha`.


### Tres cosas que estaban rotas y no se veían

Salieron recorriendo la negociación completa como la haría una persona, no leyendo código:

- **Los archivos del contrato nunca aparecían.** El popover y el panel de detalle buscaban
  el espacio por el código **corto** (`PUN-04`) mientras la base lo guarda completo
  (`NAVE-PUN-04`), así que `by-code` contestaba 404 siempre y la sección se rendía en
  silencio. El corto además se repite entre sedes.
- **El error al guardar era invisible.** Salía al pie del formulario, debajo de la nota y
  fuera de la parte visible de la ficha, mientras el botón que lo provoca vive en la barra
  de abajo: se tocaba «Guardar», el backend rechazaba el choque de fechas y en pantalla no
  pasaba nada. Ahora sale en la barra, al lado del botón.
- **La planometría de un contrato futuro no se veía.** El endpoint respondía sólo por el
  contrato que corre hoy, así que el recién vendido para la temporada que viene —que es
  cuando más se consulta— no tenía ninguna. Ahora responde el vigente o, si no hay, el
  próximo. Los vencidos no: «así debe quedar» de algo ya desmontado no es una respuesta.

### Carga masiva desde una planilla

La temporada se negocia en una reunión y queda en un Excel con cuarenta filas. Cargarlas de
a una por el mapa es media tarde de trabajo y, peor, media tarde de oportunidades de
equivocarse.

**El archivo lo lee el navegador** (`frontend/src/utils/planilla.ts`, con la librería de
Excel que la app ya usaba para ver adjuntos) y al servidor le llegan filas en JSON. Así el
backend no aprende a abrir hojas de cálculo —una dependencia más para tres tiendas— y de
paso un CSV entra por el mismo camino sin escribir nada.

**Dos pasos, `validar` y `confirmar`** (`backend/app/routers/bulk_leases.py`):

- `validar` **no escribe nada**. Devuelve un veredicto por fila —qué mueble resolvió, qué le
  falta, con qué choca— para que la revisión ocurra antes de crear cuarenta contratos y
  disparar los correos. Una importación a ciegas que sale mal no se deshace con un botón.
- `confirmar` **vuelve a validar**: entre la revisión y el botón alguien pudo vender uno de
  esos espacios desde el mapa, y crearlo igual dejaría dos proveedores en la misma punta.
  Crea sólo lo que pasa; una fila mala no tira abajo las treinta y nueve buenas.

**La planilla es la que trae la gente, no un formato.** Los encabezados se reconocen por
sinónimos (`Código`/`Espacio`, `Renta`/`Valor mensual`, `Fecha inicio`/`Desde`), la fila de
títulos no tiene que ser la primera —las planillas suelen arrancar con un título—, y hay
plantilla descargable para quien la quiera.

Las fechas se leen **día primero**: `03/04/2026` es el 3 de abril. Es la convención local, y
leerlo al revés no falla ruidosamente: crea un contrato de tres meses en el mes equivocado
sin que nada avise. Los montos aceptan `$1.800.000`, `1800000` y `1,800,000`; un separador
único seguido de exactamente tres dígitos es de miles, porque `1.800` son mil ochocientos
pesos y no un peso con ochocientas milésimas.

**Qué se rechaza y qué sólo se avisa.** Error (la fila no entra): código que no existe en el
plano, mueble no comercializable, falta proveedor/valor/fechas, fechas al revés, choque con
un contrato existente, **choque con otra fila del mismo archivo** —el error más fácil de
cometer en una planilla y el más difícil de ver leyéndola—, **código ambiguo** y **falta la
sede**. Aviso (entra, pero se mira): el valor 15% o más por debajo de la tarifa de
referencia, un correo con formato dudoso —que se descarta en vez de guardarse mal— y **el
mueble que tiene un gemelo de nombre**.

### El código ambiguo, que es cómo un contrato terminaba en el mueble equivocado

Un mueble tiene dos nombres: el `code`, que es la llave con la que se guarda todo, y la
`nomenclatura`, el nombre que la persona escribe y que lo reemplaza **en pantalla**. La
planilla resolvía sólo contra el `code`. Entonces quien leía el plano, veía «IMP-08» y
escribía «IMP-08», mandaba el contrato al mueble cuyo código es IMP-08 — que no es el que
estaba mirando, porque el que el plano dibuja «IMP-08» tiene por código IMP-12.

En CIUDAD JARDIN se renumeró a mano una corrida de impulsadores. Correr números dentro de un
conjunto cerrado garantiza que **cada nombre nuevo sea el código viejo de otro**: seis de
seis. Reproducido de punta a punta por la pantalla real, incluida la parte que importa: se
vendió dos veces lo que para quien mira el plano es el mismo espacio, a dos proveedores, con
las mismas fechas, y ninguna validación se quejó. El choque de fechas existe y funciona —con
el plano limpio rechaza la segunda venta—; lo que lo esquiva es que el nombre que se lee y la
llave que une sean dos cosas.

**Un texto ambiguo no entra.** Si lo tecleado es el `code` de un mueble **y** el nombre
dibujado de otro, la fila se rechaza y el mensaje ofrece **los dos caminos con su código
completo**, primero el que el plano dibuja con ese texto. El consejo importa tanto como el
rechazo: la primera versión decía «escribí el código completo» a secas, y seguirlo llevaba
derecho al mueble equivocado. Un mensaje que manda a la trampa es peor que ninguno.

**El código completo desempata, y por eso avisa en vez de rechazar.** `CIUDAD JARDIN-IMP-08`
identifica un mueble sin ambigüedad, así que entra — rechazarlo dejaría seis muebles
imposibles de contratar y rompería Vender, que manda siempre el código completo. Pero el
mueble al que lleva tiene un gemelo de nombre, así que la fila sale en ámbar diciendo a cuál
va y cuál es el otro. La pregunta que hace el aviso no es la del rechazo: el rechazo pregunta
por el **texto** tecleado, el aviso por el **mueble** resuelto. Preguntar sólo por el texto
dejaba pasar justo el camino que el rechazo recomendaba.

**Los avisos no se abaratan.** Con el plano sano, una tanda normal sigue dando cero avisos —
medido contra el código anterior a la fase, con los dos servidores en paralelo y la misma
planilla. Un aviso que sale en todas las filas entrena a la gente a ignorarlo, que es la misma
razón por la que «proveedor nuevo» no pinta la fila.

**La sede, que era un agujero aparte.** Sin sede el código quedaba corto y creaba **un segundo
espacio para el mismo mueble físico**, con su propio contrato y ciego al choque del otro: una
doble venta literal, sin ningún renombre de por medio. Ahora la fila sin sede no entra, el
código completo se arma con la sede **del mueble encontrado** y la sede de otra tienda se
rechaza diciendo dónde sí existe ese código.

**El eco de la revisión muestra lo que la persona reconoce.** Devolvía el `label` del tipo
—«Impulsador Marca», idéntico en los once impulsadores— y el código que la persona acababa de
teclear: dos campos indistinguibles entre el mueble correcto y el equivocado. Ahora devuelve
además `nombre_dibujado`, que es el único que los distingue, y la revisión lo muestra en su
propia columna.

**Y lo que ya está mal se ve.** «Revisar antes de negociar» no recibía el campo del nombre y
declaraba limpio un plano con cuatro nombres repetidos; ahora los lista, junto con los que
pisan el código de otro, y lista además los **contratos vigentes cuyo mueble se dibuja con
otro nombre**, con proveedor, fechas, código real y nombre dibujado. Ninguna validación nueva
bloquea el guardado de un plano que ya está mal: se avisa, no se traba, o CIUDAD JARDIN
quedaría sin poder guardarse.

**Lo que esta fase NO hace, y por qué.** No renombra el `code` de verdad: arrastra
`spaces.code` y `spaces.svg_id` (los dos UNIQUE), `mount_confirmations.space_code`, los
enlaces de montaje y el histórico de la plataforma, y este proyecto no migra. Y no resuelve la
planilla por nomenclatura, porque en el plano medido las seis nomenclaturas son ambiguas
contra un código ajeno: sola, esa opción deja seis filas que no se pueden cargar. El camino
para tener **un solo nombre** es otro y va aparte: que el `code` sea un identificador interno
que nadie ve, que el nombre sea único contra los nombres **y** los códigos de la sede, y que
todas las pantallas dibujen el nombre. Ahí renombrar propaga gratis, porque nada se une por el
nombre.

**Lo que queda abierto.** `PUT /layout/{sede}` acepta la lista de muebles sin mirar
(`schemas/layout.py`), así que la prohibición de crear un nombre que pisa un código ajeno vive
sólo en el navegador. El guardarraíl de servidor no puede ser «rechazar los choques» sino «no
aceptar choques **nuevos**», comparando contra el snapshot anterior; si no, un plano que ya
está mal deja de poder guardarse.

### Un solo nombre (fase 13): el código ES el nombre

La fase 12 administró el problema; ésta lo elimina. El dueño lo dijo mejor que el
diseño anterior: «¿no es mejor que el sistema asigne la nomenclatura
automáticamente por defecto, evitando repetirla, y que si edito el nombre solo me
deje ponerle uno que no exista, y que se cambie en todas las pantallas?».

Lo que lo hizo posible fue un dato del negocio, no una idea: **los contratos
cargados eran de prueba**. Mover el `code` arrastra `spaces.code` y
`spaces.svg_id` (los dos UNIQUE), `mount_confirmations.space_code` y el histórico
de la plataforma; con datos reales encima eso pesa, con datos de prueba no. Así
que se hizo lo correcto: **se eliminó `nomenclatura` y el `code` pasó a ser el
nombre**. Con un solo campo, el nombre es igual en todas las pantallas por
construcción, no porque alguien se acuerde de sincronizarlas.

**La renumeración.** El dueño pidió renumerar parejo las seis sedes siguiendo el
recorrido del plano, sin agregar ni borrar un mueble. Vive en
`services/renumeracion.py` con dos pasos, como la carga masiva y por la misma
razón: `previo` no escribe nada y devuelve la tabla completa antes → después;
`aplicar` escribe todo en una transacción.

**La regla de recorrido no se inventó: ya estaba medida.** Se agrupa en bandas
sobre el eje perpendicular al que se camina y se ordena dentro de cada banda. Eso
es lo mismo que hace `utils/pasillos.ts` para deducir las corridas, y §«Pasillos»
registra que ahí «el resultado coincide con lo que hizo la persona a mano: nueve
de las diez corridas calzan exactamente». Quien numeró el plano caminó pasillo
por pasillo; copiar eso es más honesto que inventar una regla y esperar que
coincida. Prueba independiente: el verificador numeró tres planos a mano como
caminaría la tienda y la renumeración dio **cero cambios** en los tres.

**Los invariantes se afirman en el código, no sólo en las pruebas.** Si el conteo
por sede cambia, si el conjunto de `id` no es el mismo, o si alguna coordenada se
movió, la operación **falla entera y no escribe nada**. El `id` del mueble es la
identidad real a través de la renumeración; el nombre es sólo cómo se lo llama.
Medido sobre seis sedes y 92 muebles, comparando 18 campos mueble por mueble:
cero diferencias.

**Los dos UNIQUE y la rotación pura.** Renumerar suele ser una permutación, y una
permutación choca a mitad de camino contra `spaces.code`/`svg_id`: se resuelve
con valores temporales en dos pasadas dentro de una transacción. Probado con
nueve góndolas cuyos nombres forman un ciclo, con contrato encima de las nueve.

**El sistema recuerda cómo se llamaba cada mueble**, en la tabla propia
`renumeracion_nombres` (una fila por mueble y por corrida) y **no** en un campo
más del mueble: un segundo campo de nombre adentro del mueble es exactamente la
clase de error que esta fase eliminó, y además se pisaría en la segunda
renumeración, perdiendo el original —que es el que dice el cartel—. Llega a la
pantalla como campo **derivado** al leer y se saca al escribir, así que el plano
guardado sigue teniendo un solo nombre. De la cadena se devuelve la punta más
vieja: la pregunta real es «qué dice el papel que tengo en la mano», y un nombre
intermedio nunca estuvo escrito en una pared.

Sin ese recuerdo, la reconciliación —«contratos para revisar uno por uno»— se
vaciaba **justo después de renumerar**, que es el único momento en que hace
falta: la tienda todavía tiene la cartelería vieja. Es el hallazgo que más caro
salía y no se veía en ninguna prueba verde.

**El papel es la mitad del valor.** El informe se imprime en A4 sin controles,
agrupado por sede, ordenado como se camina el plano, con una casilla por renglón
para tachar contra la cartelería y con las cifras a la vista: cuántos muebles hay,
cuántos cambian, cuántos se agregan (cero) y cuántos se borran (cero). Sin él,
renumerar deja el plano y el local hablando idiomas distintos.

**El guardarraíl de servidor**, que la fase 12 dejó abierto: `PUT /layout/{sede}`
rechaza los choques **nuevos** comparando cuentas contra el snapshot anterior. Se
comparan cuentas y no pares, y por eso el intercambio y las cadenas de renombres
pasan: la cuenta de cada nombre no sube. Un plano que ya está mal se sigue
guardando, y uno que llega por primera vez entra aunque venga sucio —así llega un
plano existente, y trabarlo lo haría inimportable, no más seguro—.

**El intercambio existe porque la regla sin él es impracticable.** Renumerar una
corrida a mano es una rotación, y «no puede existir» bloquea cada paso: para
llamar «IMP-08» al mueble IMP-12 hay que liberar antes ese nombre. Los tres
caminos de renombre ofrecen intercambiar como una sola operación.

**Dos errores de mensaje que valen como regla.** Un rechazo que aconseja mal es
peor que ninguno: la primera versión del mensaje ambiguo decía «escribí el código
completo» y seguirlo llevaba derecho al mueble equivocado. Y un rechazo por regla
que se pinta como falla de red —el 409 se mostraba como «Sin conexión» con un
ícono de nube tachada— le esconde a la persona la explicación que el servidor ya
le dio.

**Y una trampa de medición, anotada para el que vuelva.** La reconciliación se
alimenta de los campos comerciales desnormalizados en el mueble del layout, no de
`space_leases`: cargar contratos por la API no los escribe en el plano y la
sección no aparece. Hay que cargarlos por la pantalla de Planilla. La primera
medición de esto dio un falso negativo por eso.


Acá se es **más estricto que en el alta de a uno**: ahí un código sin mueble en el plano se
acepta —hay filas sembradas y muebles borrados después del contrato— pero en una planilla es
un tipeo, y crearlo callado deja un contrato colgado de un espacio fantasma que nadie va a
montar.

«Proveedor nuevo» se dice pero **no pinta la fila**. En una planilla de temporada casi todos
lo son, y cuarenta filas en amarillo entrenan a la gente a ignorar el amarillo —que es el
color reservado para lo que sí hay que mirar—.

**Los avisos van agrupados**: un correo al comercial con la tanda completa, uno al
mercaderista con la lista a montar (sin valores) y una constancia por proveedor con todos
sus espacios. Cuarenta contratos por el camino de a uno serían ciento veinte correos en un
minuto: nadie los lee y el proveedor de correo los trata como spam.

Tope de 300 filas por archivo. No es una limitación técnica: una planilla que no se puede
revisar en pantalla no se puede aprobar con criterio.

### La planometría

Cómo debe quedar armada la exhibición: la foto o el PDF que manda el proveedor.
**Cuelga del contrato, no del mueble** (`lease_files`, tabla nueva).

La misma punta de góndola recibe una planometría distinta cada vez que se alquila —cambia
con el proveedor y con la temporada—, así que guardada en el mueble habría **un solo
casillero que se sobreescribe**: al entrar Nutresa se pierde la de Alpina, y con ella la
única prueba de qué se acordó armar en septiembre. Colgada del contrato, cada acuerdo
lleva la suya y el histórico queda.

Tabla propia y no `space_files` con una marca en el nombre, aunque eso ya se hizo una vez
para las fotos de montaje: `list_face_images` toma la imagen más reciente de un espacio
para pintar el panel del 3D, y una planometría ahí adentro volvería a secuestrar las artes
del proveedor. Con tabla propia eso es imposible por construcción, no por convención.

Quién la ve, y por dónde llega:

| Quién | Cuándo | Cómo la encuentra |
|---|---|---|
| Admin | al cerrar el trato | la adjunta en el formulario; se sube después de crear el contrato |
| Admin | después | detalle del espacio en Supervisar — puede cambiarla o quitarla |
| Mercaderista | al montar | `GET /planometrias/por-espacio/{code}` |

El mercaderista llega **por el código del espacio**, no por el id del contrato: el enlace
del correo trae el código y no tiene por qué saber que existen contratos. El backend hace
el salto espacio → contrato **que corre hoy** → archivo, y por fechas y no por la bandera
`is_active`, que se queda en True desde que el contrato se crea.

Detalles que se ganaron el lugar:

- **Una por contrato.** Cargar otra reemplaza la anterior: dos verdades sobre cómo debe
  quedar el mismo mueble es justo lo que este archivo existe para evitar.
- **Si la subida falla, el contrato igual queda.** Ya se guardó y los correos ya salieron;
  se avisa en la confirmación y se puede cargar después desde el detalle del espacio. Ese
  mismo camino es el único que tienen los contratos anteriores a que esto existiera.
- **Se acepta PDF además de imagen.** La mitad de los proveedores manda la exhibición en
  PDF. El filtro compara contra una lista **cerrada** y nunca contra `image/*`: un SVG es
  una imagen para el navegador y un documento con scripts para todo lo demás, y esto se
  sirve inline desde el mismo origen que la app.
- **El archivo no se borra al vencer el contrato.** Es la prueba que responde un reclamo
  meses después, igual que la confirmación de montaje.

### Cancelar un contrato

`DELETE /spaces/{id}/leases/{id}` existía desde siempre y **ninguna pantalla lo llamaba**.
El agujero se veía en el propio mensaje de choque de fechas —«Cancelalo primero o ajustá
las fechas»— que mandaba a hacer algo que la aplicación no permitía.

Ahora está en el detalle del espacio (Supervisar → tocar el mueble → Ver todo), sólo para
admin y con confirmación. Cancela el que corre hoy o, si no hay, **el que ya está firmado
y todavía no arranca**: ése es el que hay que soltar cuando un proveedor se cae antes de
empezar, y era el más difícil de alcanzar porque su id no salía en ninguna respuesta —
`SpaceOut` ahora expone `upcoming_lease`, que sale de una property del modelo y **no es
una columna nueva**. La redacción para el mercaderista cubre las dos: agregar el próximo
sin tacharle el valor habría abierto por la ventana lo que la app cierra por la puerta.

Al cancelar se escribe también el JSON del layout. Sin eso el contrato desaparece de la
base y el mueble sigue pintado como vendido en el mapa, que es de donde salen todas las
pantallas. La planometría y el reporte de montaje **no se borran**: son la prueba de lo
que se acordó y de lo que se armó.

### El contrato tiene un solo dueño

El contrato se llenaba en **tres** lugares: el panel del plano 2D, el panel del editor 3D
y la pantalla de venta. Los dos primeros ya no lo hacen, y no era una duplicación inocente:

- los campos escribían el **JSON del layout** sin tocar la base, así que se podía dejar un
  proveedor y un valor puestos en el mapa sin que existiera ningún `SpaceLease`;
- el botón "Guardar contrato" llamaba a `createLease` **cada vez que se tocaba**. No editaba
  nada: corregir una fecha y volver a guardar creaba un segundo contrato sobre el mismo
  espacio. No hay endpoint de edición de contratos —sólo alta y baja—, así que la
  "edición" que se perdió al sacarlos nunca existió.

Ahora la división es por lo que cada pantalla sabe:

| | Plano 2D · Editor 3D | Sede → Vender |
|---|---|---|
| Diseño | destino, sede, nomenclatura, dimensiones, rotación, artes/archivos, observación | — |
| Comercial | lo contratado, **de sólo lectura**, con un puntero a dónde se cambia | proveedor, marca, correo, valor, fechas, nota |

El panel del plano muestra quién tiene el espacio, hasta cuándo y por cuánto (esto último
sólo para el admin), y dice que se cambia en Sede → Vender. El editor 3D, igual.

**Las pestañas dicen para qué sirven.** Los nombres solos no alcanzaban —"Plano" y
"Editor 3D" suenan a lo mismo, y desde ninguno se adivina que el contrato se llenaba ahí
adentro—. Hay una frase en el tooltip de cada una y una línea que separa el trabajo diario
(Sede · Montajes) del diseño de la tienda (Plano · Editor 3D), que es donde se entra una
vez cada tanto. El admin aterriza en **Sede**, modo Vender.

**El correo del proveedor ya se puede cargar.** El formulario lo pide, y
`/suppliers/find-or-create` **completa** el que falta sin pisar el que ya está. Antes no
había forma de cargarlo desde la interfaz, así que el tercer aviso —la constancia al
proveedor— no salía nunca.

### Pantalla de negociación: del contrato al montaje

Guardar un contrato ya no termina en la base: dispara **tres correos distintos según a
quién le sirve qué** (`backend/app/routers/spaces.py`).

- **Comercial** (administrador de sede, gerente operacional): el contrato completo, con
  el valor.
- **Montaje** (el mercaderista): el mismo espacio **sin un solo monto**, y un enlace
  directo `.../?montar=SEDE-CODE`.
- **Proveedor**, si tiene correo cargado: confirmación de lo suyo.

Los destinatarios viven en `app_config` bajo `notify_contacts`, por sede y por rol
(`backend/app/services/contacts.py`), y se editan desde Configuración. Si están vacíos
cae al `notify_emails` de siempre.

El enlace abre `MountView` (`frontend/src/pages/MountView.tsx`) en el celular: tarjetas
grandes ordenadas por urgencia — lo que ya arrancó primero —, dos botones del tamaño de
un pulgar y la cámara a un toque. El worker es el único rol que escribe algo en el
sistema, y solo esto: `POST /mounts/`. Un "no pude" **exige motivo**, porque sin motivo no
se sabe a quién reclamarle.

**Dónde queda.** Antes de preguntar nada, la pantalla muestra el plano de la tienda con el
mueble señalado (`components/MiniMapa/`) y la ubicación escrita — *"A unos 4 m de las
cajas"*. Tres decisiones que vale la pena conservar:

- **Cenital, no isométrico.** El mapa isométrico del Dashboard extruye por altura y pinta
  de atrás hacia adelante, así que tapa justo los muebles chicos —bateas, ristras— que son
  los que cuesta encontrar. Y para "estoy acá, tengo que llegar allá" la convención que
  todo el mundo ya sabe leer es la del directorio de centro comercial.
- **El alto sale de la forma de la planta**, no es fijo. Con alto fijo, una tienda larga y
  angosta —la forma normal de un supermercado— se dibujaba a menos de 5 px por metro y una
  punta de góndola quedaba de cuatro píxeles: se veía, no se podía usar.
- **Las referencias salen de los datos, no del aire.** Las cajas y las neveras se etiquetan
  porque existen como muebles. No hay flecha de norte ni "entrada" porque el sistema no
  guarda ninguna de las dos cosas, y ponerlas sería inventarle información a alguien que
  está parado en un pasillo.

El mapa busca por el código CRUDO del mueble contra el mismo arreglo del que salió, nunca
por el `SEDE-CODE`: la nomenclatura corta se repite entre tiendas y buscar suelto devuelve
el mueble de la sede equivocada. Si el mueble no está en el layout —contrato sobre un
espacio que después se borró del plano— el mapa se omite entero en vez de mostrar uno que
no señala nada.

**La distancia se mide de borde a borde, nunca de centro a centro.** No es una sutileza de
implementación: en NAVE la pared de refrigerados está dibujada como UN mueble de 26 m de
ancho, así que su centro queda a media tienda de sus propios extremos. Midiendo al centro,
a una punta que está a 3 m de la nevera se le decía "a 8 m" — y con esa frase se camina
para el lado equivocado. Con los datos reales de NAVE, el centro se equivocaba en **11 de
los 19** espacios alquilables. Por lo mismo el encuadre del plano usa la huella de cada eje
por separado: usar `max(w, d)` para los dos lados —que parecía lo seguro— inflaba el
recinto al doble de alto por culpa de ese mismo mueble, y dibujaba todo más chico de lo
necesario justo donde hay que encontrar una punta de 90 cm.

El correo de montaje lleva la ubicación **escrita**, no dibujada: Gmail descarta el SVG
embebido, un PNG obligaría a rasterizar en el servidor y una imagen servida por la app
pediría token. El texto llega intacto a cualquier cliente, y el plano vive del otro lado
del enlace. La frase la calcula `describe_location` en `services/layout_lookup.py`, que
espeja `describirUbicacion` del cliente — si las dos se separan, el mercaderista lee una
cosa en el correo y otra en la pantalla.

**La foto es obligatoria** cuando se reporta "montado", en el servidor y en la pantalla:
"montado" sin foto es una afirmación sin respaldo, y es exactamente lo que el proveedor
discute meses después. Al "no pude" **no** se le exige: si el material nunca llegó puede no
haber qué fotografiar, y dejar sin reportar un problema es peor que quedarse sin la foto.

Alrededor de esa regla hay cuatro defensas, todas porque bloquear al mercaderista es peor
que no tener la función:

- Se aceptan **HEIC/HEIF**: es lo que sale de un iPhone cuando iOS no convierte al subir.
  Rechazarlo dejaría a esa persona sin poder reportar nada desde su propio teléfono.
- La foto se **reduce en el navegador** a 1600 px y JPEG antes de salir (`utils/foto.ts`),
  con red: ante cualquier error se sube el original. Incluye un chequeo de lienzo uniforme,
  porque un HEIC que no se decodifica no lanza error — produce un JPEG negro perfectamente
  válido, y eso es peor que un rechazo: la prueba queda guardada y no muestra nada.
- Hay **timeout de subida**; sin él, una conexión colgada dejaba el botón muerto para
  siempre y la única salida era recargar, que perdía la foto.
- Se puede **elegir de la galería**, no solo tomarla: `capture` manda directo a la cámara y
  en Android saca la opción de galería, lo que dejaba atrapado a quien montó sin señal y
  volvió a reportar más tarde.

Y como la foto movida es lo más normal del mundo, el aviso de "ya se reportó" ofrece
**corregir el reporte**: el histórico guarda todos y vale el último. Sin eso, la prueba que
el proveedor va a discutir en tres meses queda siendo la primera que salió.

Dos detalles que no son obvios y que conviene no deshacer:

- **El tipo de archivo se valida contra una lista cerrada, nunca contra `image/*`.** Un SVG
  es una imagen para el navegador y un documento con scripts para todo lo demás; guardado
  como foto y servido inline desde el mismo origen que la aplicación, ejecutaría JavaScript
  con la sesión de quien lo abra.
- **La foto de montaje lleva un prefijo reservado en el nombre** (`montaje--`) y
  `list_face_images` la excluye. Se cuelga del mismo `Space` que las artes del proveedor, y
  el editor 3D usa la imagen *más reciente* de cada espacio como planograma: sin la marca,
  la foto del anaquel tomada de costado reemplazaba la textura de la góndola en la pantalla
  del comercial — y con la foto obligatoria, en cada contrato.

Se guarda **una fila por reporte**, no una por espacio (tabla nueva `mount_confirmations`,
permitida por la regla: `create_all` sí crea tablas). El histórico de quién dijo qué y
cuándo es justamente lo que contesta cuando el proveedor reclama meses después. La hora la
pone el servidor: el EXIF de un celular se edita.

Borrar una sede **archiva** sus confirmaciones (`archivado_en`) en la misma transacción que
archiva sus contratos. No se borran —son prueba— pero dejan de contar: una sede recreada
con el mismo nombre reusa los mismos códigos y heredaría los "montado" de la anterior.
Cubierto en `backend/tests/test_mounts.py`.

### Bugs preexistentes corregidos

Los tres se encontraron levantando la app contra datos sembrados, no leyendo código:

- **El plano 2D subía un layout vacío** ~16 ms después de montar, antes de que llegara la
  respuesta del servidor. Desde un navegador con `localStorage` limpio, abrir la app
  **vaciaba la sede en el servidor**. Es la causa de fondo del problema de sincronización
  original: no es que los cambios no viajaran, es que el otro equipo los borraba al entrar.
- **El editor 3D borraba `faceB` y `nomenclatura`** de todos los fixtures con solo abrirse,
  y subía la pérdida.
- **El proxy de Vite quitaba el prefijo `/api`** que el backend sí monta, así que
  `npm run dev` nunca pudo hablar con un backend local.

---

### Qué hay de verdad en los planos (agosto 2026)

Medido contra producción, porque el mapa del montaje vale lo que valga la fidelidad del
plano y eso no se puede suponer:

| Sede | Muebles |
|---|---|
| NAVE | 104 |
| POBLADO | 104 |
| CENTRO | 48 |
| NORTE | 6 |
| ciudad jardin | 1 |
| TERRON | **0** |
| SUR | 0 |

**NAVE está a escala, y bien.** Huella de 42,4 × 15,8 m (669 m²), con los muebles ocupando
el 29 % del recinto — proporción normal de un supermercado con sus pasillos. El 92 % de los
muebles tiene medidas propias, no la del catálogo: alguien midió. Las coordenadas caen en
la grilla de 5 cm del editor (86 %) y **ninguna** en metros enteros, que es la firma de un
plano medido y no de uno acomodado para que se vea lindo. Solo 2 pares de góndolas se pisan
(GON-46/GON-48 y GON-60/GON-67) y no hay muebles apilados en la misma coordenada.

Dos cosas que conviene saber antes de tocar el mapa:

- **Los muebles largos se dibujaron como uno solo.** La pared de refrigerados es un único
  `nevera_refrescos` de 26,05 m; hay otro de 10,05 m y un `nevera_carnes` de 6,05 m. Es una
  representación razonable de una corrida continua, pero rompe cualquier cálculo que trate
  al mueble como un punto.
- **Hay 12 muebles de referencia** en NAVE (5 cajas, 3 neveras de refrescos, 3 stands de
  frutas, 1 mostrador de carnes), así que la frase de ubicación y las etiquetas del mapa
  tienen de dónde salir. En una sede donde solo se dibuje lo alquilable no habría ninguna:
  ahí el mapa sigue funcionando, pero sin etiquetas ni frase.

De los 104 muebles de NAVE, **19 son comercializables**. El resto es infraestructura, que es
justo lo que hace legible el mapa: contexto en gris y todo el color en el destino.

---

## El 3D asumía una tienda que no existe

El editor 3D nació con un local ficticio de **30 × 42 m anclado en el origen**, en dos
constantes: `STORE_W` y `STORE_D`. Todo colgaba de ahí — por dónde se puede caminar, dónde
se dibuja la grilla, hasta dónde llega el piso que recibe los clics, adónde apunta la luz.

Ninguna sede real cabe en esa caja. NAVE ocupa **47,4 × 20,8 m y empieza en x = −25,4**: de
sus 104 muebles, **48 (el 46 %) quedaban fuera** y eran literalmente inalcanzables a pie. La
mitad izquierda del supermercado no se podía visitar. Al mismo tiempo sobraban 30 m de piso
vacío hacia el fondo, porque la caja se estiraba hasta z = 44 donde la tienda termina en
13,3.

Ahora la extensión del local **se deduce de los muebles**, en `frontend/src/utils/planta.ts`.
El módulo es geometría pura y vive fuera del componente a propósito: así se puede probar sin
montar Three.js ni un navegador (`npm run probar:planta`, 15 pruebas).

**La huella de un mueble se calcula rotada.** El helper de colocación (`getAABB`) ignora
`rotY` porque los muebles se colocan sin girar, pero para caminar no se puede: 63 de los 104
muebles de NAVE son góndolas y la mayoría están giradas 90°. Sin la rotación, una góndola de
3,6 m de largo se lee como si midiera 0,9 m y uno la atraviesa caminando.

### Caminar

- **Los muebles frenan.** Antes no había colisión de ninguna clase: se atravesaban las
  góndolas. El choque se resuelve **por eje**, así que uno resbala a lo largo de la góndola
  en vez de clavarse contra ella.
- **El paso se mide en metros por segundo**, no por frame. Eran `0,08` por frame — a 60 fps,
  4,8 m/s, o sea trotando, y en una pantalla más rápida iba más rápido todavía. Ahora son
  1,4 m/s caminando y 3,2 con Shift.
- **El paso se recorre en tramos cortos** (`PASO_MAXIMO = 0,2 m`). El choque se mide punto a
  punto, así que un paso más largo que el obstáculo lo saltaba limpio. Hoy un paso dura como
  mucho 0,32 m y lo más delgado que hay —una columna de 30 cm— mide 0,86 m ya inflada por el
  radio del cuerpo, así que no pasaría; pero eso dependía de que nadie subiera la velocidad.
- **Se entra por un lugar libre.** El centro del local, o el primer punto despejado buscando
  en espiral: nadie aparece dentro de una góndola.
- **La Zona Libre se pisa.** Lo que mide menos de 25 cm de alto es una marca en el piso, no
  un obstáculo. Es una regla por altura, no una lista de tipos, así que un mueble bajo nuevo
  queda bien solo.
- **Quien queda dentro de un mueble puede salir.** Si alguien coloca una góndola encima
  mientras se camina, frenarlo ahí lo dejaría atrapado para siempre.

### Lo que se veía mal por lo mismo

- **La grilla y el piso que recibe clics** estaban centrados en la tienda ficticia. Un
  pedazo del local quedaba sin piso: hacer clic ahí no hacía nada.
- **Arrastrar un mueble** estaba topado en `x ≥ 0`, así que la mitad izquierda de una sede
  real no se podía editar.
- **La luz y su cámara de sombras** apuntaban al centro de la caja: la sombra se recortaba
  justo donde empieza la mitad izquierda de NAVE.
- **La advertencia de "góndola mural cerca de una pared"** salía siempre, porque medía
  contra x = 30 / z = 42 en vez de contra donde terminan los muebles.
- **El encuadre al abrir.** Una cámara guardada apuntando al centro de la tienda ficticia
  (15, 21) dejaba la sede arrinconada en una esquina de la pantalla. Ahora se reencuadra
  siempre que la mira caiga fuera del local; si el usuario la dejó adentro, se respeta.
- **Salir de la caminata no devolvía la vista.** Faltaban dos cosas que ya faltaban antes:
  `update()` en los controles —sin él la cámara conserva la rotación de la caminata y sigue
  mirando la góndola que uno tenía enfrente— y un `invalidate()`, porque el lienzo sólo
  renderiza bajo demanda y el cuadro nuevo nunca se dibujaba.

### El minimapa y el teletransporte

Lo que hace abandonar un recorrido en primera persona no es que se vea feo: es no
saber dónde uno está parado. El minimapa es el préstamo más directo que hay de los
videojuegos y resuelve exactamente eso.

**Es el mismo `MiniMapa` de la pantalla del montaje**, no uno nuevo. Se le agregaron dos
cosas y el resto quedó igual:

- `camara={{ x, z, dirX, dirZ }}` dibuja el "usted está aquí" con su cono de visión. Se le
  pasa el **vector** de dirección y no un ángulo a propósito: el 3D lo saca de
  `camera.getWorldDirection()` y así nadie tiene que acertarle desde afuera a la convención
  de Euler de Three.js.
- `onIrA(x, z)` vuelve el plano entero elegible **por posición y no por mueble**, y devuelve
  metros. Ése es el teletransporte.

`targetCode` pasó a ser opcional: la caminata no señala ningún mueble en particular.

**Dónde aterriza el salto.** En el lugar despejado más cercano a lo que se tocó
(`puntoLibreCerca`, el mismo que elige por dónde se entra). Quien apunta al medio de una
góndola quiere el pasillo de al lado, no que no pase nada. La mirada no se toca: uno salta,
no gira.

**Por qué el salto pide soltar el mouse.** Con el puntero capturado el navegador lo esconde
y manda todo al lienzo: no hay cursor que pueda tocar un `<div>`. Así que el minimapa
siempre orienta, pero sólo se vuelve clickeable con el mouse suelto — `Esc`, clic en el
plano, y clic en el lienzo para seguir caminando. Es el mismo patrón de cualquier juego que
abre el mapa grande soltando el control.

**Un bug que sólo se veía estando quieto.** El lienzo corre con `frameloop="demand"`:
dibuja cuando alguien se lo pide. `PointerLockControls` mueve la cámara en el `mousemove`,
fuera del bucle de cuadros, y nadie pedía el redibujo — así que **parado y mirando alrededor
la imagen quedaba congelada** hasta tocar una tecla de movimiento. Caminando no se notaba,
porque el propio paso pedía el cuadro. Se arregla enganchando `invalidate()` al `change` del
control.

**El minimapa no re-renderiza 60 veces por segundo.** La posición se informa sólo cuando uno
se movió más de 12 cm o giró lo suficiente; caminando eso son unas pocas veces por metro.

Y de paso: las etiquetas de referencia se calculaban 5 px por letra, pero van en negrita, en
mayúsculas y con `letter-spacing`. Con esa cuenta "CARNES" y "NEVERAS" pasaban el filtro de
choque en NAVE y se dibujaban una encima de la otra igual. Ahora son 6,5.

---

## Las cuatro del proveedor

El 3D dejó de ser una maqueta bonita: es con lo que se le muestra a un proveedor
qué está comprando.

### Ver la exhibición en 3D

Un botón en la ficha del espacio —tanto en el formulario de negociación como en la
ficha de detalle— lleva al Editor 3D **encuadrando ese espacio**. Antes había que
entrar a mano y buscarlo entre 104 muebles.

El pedido viaja por el store (`enfoque3D`) porque la pantalla de sede y el editor 3D
son pestañas hermanas sin props entre ellas. Se identifica **por id de mueble y no
por código**: el código corto se repite entre sedes y a veces llega con el prefijo
puesto y a veces no.

**Cómo se calcula el encuadre.** En la caja de Three.js el orden de materiales es
`[+X, −X, +Y, −Y, +Z, −Z]`, y el editor pinta la cara A en el índice 5 y la B en el
4: la **cara A mira a −Z y la B a +Z** en coordenadas locales, y después el mueble
gira `rotY`. La cámara se para de ese lado, a la distancia que necesita el campo
visual para que la exhibición entre llena, y nunca por debajo de 1,65 m — una batea
de 80 cm mirada desde 40 parece una foto tomada en el piso.

Un detalle que costó una prueba: **la cara mide `w` × `h` siempre**. Es una cara de
la caja, abarca los ejes locales del mueble; girarlo cambia hacia dónde apunta, no
cuánto mide. No confundir con `huella`, que sí intercambia ancho y fondo porque
describe la caja alineada al mundo.

### Vistas guardadas por espacio

Con un mueble seleccionado, el panel derecho ofrece guardar la cámara actual como
**la** vista de ese espacio y esa cara. Al enfocarlo de nuevo abre en ese ángulo; sin
vista guardada, en el encuadre calculado. Se puede olvidar.

Vive en el JSON del layout (`vista3D` por mueble, por cara), así que viaja al
servidor y aparece en la laptop del que arma la propuesta. **Sin migración.**

Dos cuidados:

- `fixturesToStore` tiene que arrastrarla. El 3D no la modela, y sin esa línea
  **mover un mueble borraba todos los encuadres de la sede** y le mandaba la pérdida
  al servidor.
- Guardar y borrar escriben el layout pero **no entran al historial**: que Ctrl+Z
  deshaga un encuadre de cámara mezcla dos cosas que no tienen nada que ver.

Se guarda la cámara ORBITAL. En primera persona la cámara no se persiste —la
caminata escribiría cientos de veces por recorrido— así que el botón lo avisa en vez
de guardar algo viejo.

### Antes / después del arte

Un interruptor en la barra apaga las artes del proveedor. El «antes» es el mueble
**pelado**: ni la foto ni el patrón de categoría, que es contra lo que se compara la
marca puesta.

### La lámina para el proveedor

El botón de captura bajaba un volcado crudo del lienzo. Un PNG suelto sin sede, sin
código de espacio y sin período no se puede adjuntar a nada: el que lo recibe no sabe
si es su punta de góndola o la de al lado.

Ahora, con un mueble elegido, saca **dos tomas desde la misma cámara** —sin arte y
con arte— y las compone con un pie que dice proveedor, categoría, período, valor y
mueble. La plata se tacha para el rol trabajador, igual que en el resto: una lámina
es un archivo que se reenvía.

Tres cosas que sólo se vieron mirando el archivo que salía:

- **El PNG salía en blanco.** El lienzo no se creó con `preserveDrawingBuffer`, así
  que el búfer se limpia al componer y un `toDataURL` suelto no lee nada. Hay que
  dibujar y leer en el mismo turno.
- **El gizmo y la caja de selección salían en la foto.** Apagarlos por estado de
  React deja la captura a merced de cuándo React confirma el cambio, y el gizmo
  aparecía en la primera de las dos tomas. Se marcan con `userData.chrome` y los
  esconde la propia captura, sincrónicamente.
- **Sin arte cargada las dos tomas salen idénticas.** Mostrar el mismo dibujo dos
  veces rotulado «Hoy» y «Con la marca» es mentirle al que recibe la lámina: ahí va
  una sola imagen.

### Y un gizmo que nunca se dibujó

`TransformControls` dejó de ser un `Object3D`: en three 0.184 extiende `Controls`, y
lo que va a la escena es su ayudante (`getHelper()`). El `as unknown as THREE.Object3D`
que había silenciaba el error de tipos pero no el de runtime — la escena rechazaba el
objeto y **la flecha para mover un mueble nunca se dibujó**. Sólo se veía al
seleccionar, que hasta ahora era raro; con «Ver en 3D» seleccionando solo, saltó a la
primera.

---

## El plano, que es donde empieza todo

De acá salen los espacios que se venden, el metraje que se cobra, el recorrido
que se le muestra al proveedor y el mapa con el que el mercaderista encuentra la
exhibición. Un error acá no se nota hasta que ya viajó a un contrato.

**El plano de NAVE está sano** — se midió antes de tocar nada: 104 muebles, 0
códigos repetidos, 0 prefijos mal puestos, se camina entero con hombro de 1,20 m
y sólo dos roces de 0,01 y 0,03 m². El problema no eran los datos: era que el
editor no protegía lo que alguien había hecho a mano.

### Una sola nomenclatura

Había dos, una por editor. El plano 2D generaba `GON-01` con `max + 1`; el editor
3D generaba `NAVE-GON-001` **contando** cuántos había. Contar no es lo mismo que
buscar el siguiente libre: con `GON-01` y `GON-03` en el plano, contaba 2 y
devolvía `GON-03` otra vez. **Dos muebles con el mismo código son dos espacios
compartiendo contratos, archivos y correos de montaje.**

Ahora viven en `utils/nomenclatura.ts`, los usan los dos editores, y el código
devuelto es el primer número **libre** —no `max + 1`, que bastaba una edición
manual para hacerlo chocar. La sede no va en el código: se antepone al guardar el
espacio (`fullSpaceCode`), que es donde hace falta que sea único entre sedes.

Editar un código a mano tampoco puede pisar a otro: el campo se tiñe y no cierra.

### Juntos sí, encima no

Los dos editores comparaban cajas **sin rotar**. El 2D zafaba porque intercambia
ancho y alto al girar, así que sus medidas ya vienen giradas; el 3D no, y la
mayoría de las góndolas de una sede real están giradas 90°: una de 3,6 × 0,9 se
leía como 0,9 de ancho y se podía soltar atravesada sobre otra.

Peor: en el 3D **el fantasma se pintaba rojo y el clic soltaba el mueble igual**.
El aviso era decorativo. El plano 2D siempre lo bloqueó.

La regla ahora es una y explícita, en `TOLERANCIA_CONTACTO` (2 cm):

- **Hasta 2 cm es contacto.** Una corrida se arma poniendo las góndolas al ras y
  eso tiene que salir siempre. Con «cero solape» bastaba el ruido de coma
  flotante de una rotación —`cos(90°)` da 6·10⁻¹⁷, no 0— para que el editor se
  negara a dejarlas juntas. Dos centímetros es menos que la grilla de 5 cm con la
  que se dibuja: por debajo de eso nadie lo puso ahí a propósito.
- **Por encima es un mueble sobre otro**, y se bloquea.

### Pasillos

Un supermercado no se recorre por códigos sueltos. Quien negocia dice «la punta
del pasillo 3», no «PUN-07».

El plano ya tenía esa estructura y el editor no la conocía: las 56 góndolas
principales de NAVE forman **10 corridas limpias**, y quien lo dibujó las numeró
en orden. `utils/pasillos.ts` lo deduce de la geometría agrupando por la
coordenada perpendicular, y el resultado **coincide con lo que hizo la persona a
mano**: nueve de las diez corridas calzan exactamente con los códigos existentes,
y cada pasillo recibe sus dos puntas, una por cabecera. Los 18 muebles sin
pasillo son la pared perimetral, las cajas y las zonas libres — que efectivamente
no están en ningún pasillo.

**No se guarda: se deduce.** Mover una góndola cambia su pasillo, y un dato
guardado se quedaría viejo sin que nadie se entere.

**El código no lleva el pasillo, a propósito.** El código es la llave de los
contratos, los archivos, los correos de montaje y los enlaces ya enviados:
renombrar `GON-17` a `P03-GON-05` huerfaniza todo eso y obliga a migrar `spaces`,
`space_files` y `space_leases`. El pasillo se muestra al lado.

### Revisar antes de negociar

Un botón en la barra del plano abre `utils/revision.ts`, que reporta:

| | |
|---|---|
| Códigos repetidos | error — dos espacios compartiendo historia |
| Muebles encimados | error arriba de 0,05 m², aviso debajo |
| Pasillos angostos | error si no pasa una persona (0,56 m), aviso si no pasa un carrito (0,90 m) |
| Prefijo que no corresponde al tipo | aviso |
| Piso encerrado entre muebles | aviso — se ve en el plano pero no se puede caminar |

Cada hallazgo salta al mueble. Sobre NAVE reporta exactamente los dos roces
reales y nada más; los huecos entre sus pasillos van de 1,30 a 2,80 m.

### Los atajos: por qué «a veces andaban»

**Duplicar fallaba para 11 de los 17 tipos del catálogo, en silencio.** `Ctrl+D`
desplazaba la copia 0,5 m en los dos ejes y la descartaba si chocaba. Una Góndola
Doble mide 0,90 × 0,90: la copia siempre se solapaba con su original, se tiraba, y
no pasaba nada ni se avisaba. Andaba sólo para los seis tipos que miden menos de
50 cm en alguno de sus lados (mural, punta, robatope, ristra, impulsador,
columna). De ahí el «a veces funciona».

Ahora la copia cae **al ras al lado**, que es para lo que se usa el atajo: seguir
armando una corrida. Si no hay lugar, lo dice.

**Pegar pegaba encima.** `Ctrl+V` probaba cinco desplazamientos en diagonal y, si
ninguno servía, pegaba igual sobre lo que hubiera. Ahora busca de verdad y el
grupo se mueve entero, así que media corrida copiada vuelve como media corrida.

**⌘Z no andaba en Mac.** Deshacer y rehacer miraban sólo `ctrlKey`, mientras que
⌘A, ⌘D, ⌘C y ⌘V sí aceptaban `metaKey`. Ahora todos aceptan los dos.

**`R` rotaba de más y de menos.** Sin guarda de modificadores, `Ctrl+R` (recargar)
también rotaba; y sólo giraba si había EXACTAMENTE un mueble elegido, así que con
dos o más no hacía nada y no decía por qué. Ahora exige que no haya modificadores
y gira toda la selección.

**El plano no tenía ningún aviso.** Un atajo que no hacía nada era indistinguible
de uno que no existía. Ahora cada acción confirma en pantalla —«3 muebles
duplicados», «No hay lugar libre cerca»— y borrar recuerda que `Ctrl+Z` existe.

### Dónde están escritos

Un botón **Atajos** en la barra del plano abre la lista completa, agrupada por
para qué sirve. La barra de estado muestra un resumen **sacado de la misma
constante**, así que no se pueden desfasar.

Antes la única ayuda era esa línea de la barra: con `white-space: nowrap` y
`text-overflow: ellipsis` se cortaba en una ventana angosta, y de entrada no
mencionaba deshacer, duplicar, copiar, pegar ni Escape. (Hay un `ZoneEditorPanel`
con una lista de atajos en `components/FloorMap/`: es código muerto, no lo importa
nadie.)

---

## El correo de un contrato

Guardar un contrato dispara **tres** correos, uno por rol:

| Para | Qué lleva |
|---|---|
| **Comercial** (gerente + admin de la sede) | resumen con el **valor mensual** |
| **Montaje** (mercaderista de la sede) | orden de trabajo **sin valores**, con dónde queda en palabras y el enlace `/?montar=SEDE-CODE` |
| **Proveedor** | constancia de lo acordado, con el valor. Sólo si tiene correo cargado |

Los destinatarios salen de la libreta (`notify_contacts` en `app_config`), por sede
y por rol. Si está vacía se cae a la lista global vieja (`notify_emails`).

### La pantalla afirmaba lo que no había pasado

La confirmación decía **«Ya salieron los avisos: …»** como frase fija. Con el SMTP
sin configurar en el servidor —que es como viene `render.yaml`— o sin un solo
contacto cargado, decía exactamente lo mismo y no salía ni un correo.

Cerrar una negociación creyendo que se avisó al mercaderista, y que no se haya
avisado a nadie, es el modo de falla que vuelve inútil la herramienta.

Ahora `POST /spaces/{id}/leases` devuelve un bloque `avisos` con `smtp_listo` y las
direcciones por rol, y la pantalla dice lo que de verdad pasó: a quién se le avisó,
o que **no se avisó a nadie** y por qué. Reporta lo **encolado**, no lo entregado —
los envíos son tareas en segundo plano que corren después de responder— pero eso ya
es la diferencia entre «se intentó» y «se afirmó sin intentar».

### El aviso previo estaba muerto

`NotifyPreview` avisa **antes** de guardar si el correo no está configurado o si no
hay contactos para esa sede. Estuvo vivo hasta `64a30d2` y **quedó sin montar en
`12695c2`**, el commit que partió el contrato en un hook más piezas de
presentación: el componente siguió existiendo, nadie lo importó, y la pantalla pasó
a afirmar los avisos sin poder saberlo. Ahora vive en la ficha de Vender, justo
encima del botón de guardar, con los tokens claros de esa pantalla.

### El correo de prueba miraba la clave equivocada

`POST /notifications/test` leía **sólo** `notify_emails`, la lista global vieja, y
no la libreta de contactos de donde salen los avisos de verdad: con la libreta
llena respondía «no hay destinatarios» y nadie entendía por qué. Ahora junta las
dos y el mensaje incluye servidor, remitente y destinatarios, para poder verificar
la configuración sin adivinar.

### El hosting bloquea la salida SMTP

Se cargaron las credenciales de Gmail en Render y el botón de prueba falló. El log
del servidor lo resolvió en una línea:

```
File "smtplib.py", line 312, in _get_socket
  return socket.create_connection((host, port), timeout, ...
OSError: [Errno 101] Network is unreachable
```

Falló en `create_connection`: **nunca llegó a autenticarse**. No era la contraseña.
Render en plan gratuito cierra la salida SMTP, así que ninguna credencial de Gmail
funciona ahí. El puerto 443 sí sale.

### Dos caminos, elegidos con `EMAIL_PROVIDER`

| | |
|---|---|
| `smtp` **(por defecto)** | `smtplib` contra un servidor de correo. Necesita salida SMTP abierta |
| `brevo` / `sendgrid` | una llamada HTTPS a la API del proveedor |

**El SMTP no se reemplazó, se le sumó una alternativa.** Sin `EMAIL_PROVIDER` nada
cambia: una instalación existente no se entera. Si mañana el plan de Render permite
salida SMTP, se borra esa variable y las credenciales que ya estaban vuelven a
funcionar solas — hay una prueba que lo fija.

Se usa `urllib.request` y no `httpx` ni `requests` a propósito: `requirements.txt`
no trae ningún cliente HTTP, y una dependencia nueva es una forma de romper el
despliegue.

Los dos proveedores permiten verificar **una dirección suelta** como remitente
—`bmgpersonal99@gmail.com`, sin dominio propio—, que es lo que hacía falta acá.

### Configurar el envío

**Por HTTPS** (lo que funciona en el plan gratuito):
`EMAIL_PROVIDER=brevo`, `EMAIL_API_KEY`, `MAIL_FROM` y opcionalmente
`MAIL_FROM_NAME`. La dirección de `MAIL_FROM` tiene que estar verificada como
remitente en el proveedor.

**Por SMTP**: `SMTP_USER` y `SMTP_PASSWORD`, más `SMTP_HOST` (por defecto
`smtp.gmail.com`) y `SMTP_PORT` (por defecto `587`). Con Gmail, `SMTP_PASSWORD` no
es la contraseña de la cuenta sino una **contraseña de aplicación** de 16
caracteres, que exige verificación en dos pasos. Google la muestra en cuatro grupos
separados por espacios y quien la copia se los lleva puestos: **el módulo se los
saca**, porque el servidor la rechazaba con un error de credenciales que no
mencionaba los espacios.

**El puerto decide el modo**: 465 abre SSL desde el saludo y 587 hace STARTTLS.
Antes se hacía `starttls()` siempre, así que configurar 465 —una elección
habitual— fallaba con un error que no mencionaba el puerto.

**Los destinatarios** se cargan desde el ícono de ajustes del encabezado: gerente
operacional, y por sede el administrador y el mercaderista.

### El botón de prueba ahora sirve para probar

Respondía «No se pudo enviar el correo de prueba. Revise las credenciales SMTP y
los registros del servidor» pasara lo que pasara: una contraseña rechazada y un
puerto bloqueado por la red daban el mismo texto, y para distinguirlos había que
entrar a los logs del servidor. Un botón de prueba que no dice qué falló no prueba
nada.

Ahora devuelve el motivo real, más el servidor, el remitente, los destinatarios y
**cuántos segundos tardó** — que distingue una autenticación rechazada (vuelve en
menos de un segundo) de un puerto bloqueado (tarda hasta que corta el temporizador)
sin leer un solo log.

Un detalle de orden que costaría encontrar: **`smtplib.SMTPException` hereda de
`OSError`**, así que un `except OSError` puesto antes se traga también los errores
de autenticación y los reporta como problema de red.

---

## La mercaderista ya no entra con contraseña

El correo de montaje llevaba un enlace pelado y del otro lado había un login. La
mercaderista entraba con la **contraseña compartida del rol `worker`** y
aterrizaba en el tablero: el mapa de la sede entera, la tabla con el proveedor,
el período y el estado de cada espacio. Todo eso para responder una sola
pregunta — ¿lo montaste? —. Y una contraseña compartida repartida por correo
sobrevive a la persona que deja de trabajar ahí.

Ahora el correo lleva un **enlace firmado**: un JWT de rol `montaje`, acotado a
ESE espacio y con vencimiento a 30 días (`MONTAJE_TTL_DAYS`). Se toca y se está
adentro, sin contraseña, en una pantalla que sólo tiene ese espacio.

### La regla de la que cuelga todo: cerrado por defecto

`decode_token` **no reconoce el rol `montaje`**, así que `require_auth` lo
rechaza en toda la aplicación. Lo abre `require_montaje`, y sólo está puesto en
un router nuevo —`/api/montaje`— que es todo lo que ese token alcanza.

Es a propósito y al revés de lo que sale natural: dejarlo pasar por la puerta
general y filtrar endpoint por endpoint significa que el endpoint que alguien
agregue mañana nace abierto. Así nace cerrado.

`test_el_token_no_abre_ningun_otro_endpoint` recorre **las rutas de verdad** de
la app —26 hoy, con `/api/health` como única excepción escrita a mano— y exige
401 en todas. Si alguien agrega un endpoint, el barrido lo prueba solo; si
agrega uno con un parámetro que el test no sabe rellenar, falla pidiendo que se
lo enseñen, en vez de saltárselo en silencio.

### Tres endpoints, ni uno más

* `GET /montaje/mi-espacio` — todo lo que la pantalla muestra, en **una sola
  llamada**: su espacio con proveedor, marca y fechas; los vecinos como **pura
  geometría** para dibujar dónde queda; si hay planometría; y el último reporte.
  Una y no cuatro porque del otro lado hay un celular con señal de supermercado.
* `GET /montaje/planometria` — el archivo de "así debe quedar". Se sirve desde
  acá y no por `/planometrias/{id}` para no tener que abrir ese endpoint: allá
  el id viene del pedido y habría que confiar en una comprobación; acá el
  archivo se resuelve **desde el token** y no hay id que cambiar en la barra de
  direcciones.
* `POST /montaje/reportar` — el reporte. El código del espacio **no se toma del
  formulario**: sale del token. Un campo del formulario lo escribe el cliente, y
  con un enlace repartido por correo eso alcanza para escribir sobre el espacio
  de otro proveedor.

Los vecinos pasan por una **lista blanca** (`_GEOMETRIA`) y no por una negra: un
campo comercial que se agregue mañana al layout no se filtra por olvido.

### Una sola definición de qué es un reporte válido

Hay dos puertas al mismo acto —el tablero con sesión y el enlace firmado— y las
reglas (foto obligatoria si "montado", motivo obligatorio si "no pude", tipos de
imagen aceptados, el prefijo `montaje--` que evita secuestrar la textura del 3D)
viven en **una** función: `registrar_montaje` en `routers/mounts.py`. Duplicadas,
la copia que se olvide de exigir la foto es justo la que usa quien monta.

Lo mismo del lado del navegador: el formulario salió de `MountView.tsx` a
`components/Montaje/FormularioMontaje.tsx` y lo usan las dos pantallas. Lo que
cambia entre ellas entra por props — a dónde se manda el reporte, de dónde sale
la planometría, y si hay una lista a la que volver.

Y qué contrato manda hoy sobre un espacio es **una** regla
(`services/contratos.py`), compartida con la planometría por código: si cada uno
eligiera por su cuenta, el enlace mostraría "así debe quedar" de un contrato y
los datos de otro.

### Del lado del navegador

`App.tsx` lee `?t=` **una vez, al arrancar**, antes de cualquier sesión: con ese
token no hay tablero, no hay sincronización de layout y no hay login. El token
se queda en la URL a propósito —es la credencial del enlace, y ahí sobrevive a
una recarga—.

`api/montaje.ts` es un cliente axios **aparte** del de la sesión y guarda el
token **sólo en memoria**. Meterlo donde vive el de la sesión tendría dos
costos: al admin que abre el enlace en su propio computador para revisar algo lo
sacaría de su sesión, y dejaría la credencial de un enlace repartido por correo
en el `localStorage` del navegador. Verificado en el navegador: el admin abre el
enlace, ve la pantalla de montaje, vuelve a `/` y sigue siendo admin.

Un enlace inválido o vencido **no dice «iniciá sesión»** — dice que el enlace ya
no sirve y que pida que se lo reenvíen. Decirle a alguien que inicie sesión es
mandarlo a buscar una contraseña que ya no necesita tener.

### Lo que NO cambió

El rol `worker` sigue existiendo y la pestaña *Montajes* del tablero sigue ahí:
quien tenga la contraseña puede seguir entrando por ese camino. Lo que cambió es
que la mercaderista **ya no la necesita**. Cuando esto esté rodando, la
contraseña de worker se le puede dejar de dar.

Los correos ya enviados llevan enlaces sin `?t=`: siguen cayendo en el login y
funcionando como antes.

---

## Probarle el producto al mueble, delante del proveedor

El 3D mostraba lo que YA está contratado. Para cerrar un trato tiene que
mostrar lo que **podría** estar: el proveedor pregunta «¿y cómo se vería mi
producto acá?» y la respuesta tiene que salir en la pantalla, en esa reunión.

### Por qué el arte no podía seguir colgando del espacio

El arte entraba por los archivos del espacio en el plano 2D, y el 3D tomaba la
imagen **más reciente** de ese espacio (`list_face_images`). Tres consecuencias:

* No había botón en el 3D, que es justo donde se está negociando.
* El arte quedaba atada al espacio: el mismo producto había que **resubirlo en
  cada punta** que se quisiera mostrar.
* Cualquier imagen subida al espacio se convertía en el producto del mueble —un
  contrato escaneado en JPG, la foto de un pasillo—. Ya se había reservado el
  prefijo `montaje--` para que la foto de la mercaderista dejara de secuestrar
  la textura, y ese parche tapa **un** caso de los muchos posibles.

Ahora hay tabla propia (`supplier_assets`, sin migración: `create_all` sí crea
tablas nuevas) y el arte cuelga del **proveedor**. Se carga una vez y se le
prueba a cualquier mueble, de cualquier sede. El camino viejo sigue andando
para lo que ya está cargado.

### La prueba NO se guarda en el layout

Es la decisión de fondo y va contra lo que sale natural. El layout es lo que
está montado **de verdad**: si probar un producto lo escribiera ahí, la góndola
que Nutresa tiene alquilada aparecería con producto de Alpina en la pantalla de
todos, y el 3D dejaría de servir para saber qué hay puesto en la tienda.

La prueba vive en la sesión, indexada por `${fixtureId}|A` — por **id de mueble
y cara**, no por código de espacio: el código se compone en tres lugares con
reglas de prefijo y mayúsculas, y basta que una difiera para pintar el mueble
equivocado.

Prioridad de la cara: `producto en prueba → foto del espacio → patrón de
categoría → color plano`. La prueba va primero porque es una elección explícita
hecha en ese momento, delante del proveedor: tiene que ganarle a lo que haya
cargado de antes, que es justamente lo que se está proponiendo reemplazar.

### La lámina ya no le miente al proveedor

Es el arreglo más importante de todo esto. La lámina tomaba el proveedor, la
categoría, las fechas y el valor **del contrato vigente sobre ese espacio**.
Probándole un producto de Alpina a una punta alquilada por Nutresa, salía la
foto del yogur de Alpina y, debajo, «Proveedor: Nutresa» con las fechas y el
valor de Nutresa. El error más caro posible en el único papel que el proveedor
se lleva.

Ahora, cuando se está proponiendo, el pie habla de la propuesta: proveedor y
producto del arte que se está probando, y **sin período ni valor** — de lo
propuesto todavía no hay nada acordado, y poner las fechas del contrato de al
lado sería inventarlas. El rótulo de la segunda toma dice «Con Alpina» en vez
de «Con la marca», y el archivo sale `NAVE-PUN-01_Alpina_antes-despues.png`.

### Un bug viejo que salió al probar esto

**El panel comercial del 3D no se abría haciendo clic en un mueble.** El mueble
se selecciona en `pointerdown`, pero el `click` que viene después seguía bajando
hasta el piso —que está detrás y sí tiene `onClick`— y ahí `onFloorClick` hacía
`setSelectedId(null)`. Un clic seleccionaba y deseleccionaba en el mismo gesto.

Se notaba poco porque al panel se llega también desde **Vender**, que fija la
selección desde afuera. Se arregla cortando la propagación en el `onClick` del
mueble; mientras se está **colocando** uno no se corta, porque ahí el clic tiene
que llegar al piso, que es quien detecta que se está montando sobre otro.

### Cómo se comprobó

16 pruebas nuevas del catálogo (quién carga, quién mira, el SVG rechazado, el
arte que no se pisa con los archivos del espacio) y 3 del pie de la lámina.
Y manejando Chromium contra un backend real: cargar el arte, elegirla del
selector, ver la góndola surtida con el producto parado sobre cada entrepaño,
apagar las artes para el «antes», y exportar la lámina de una punta alquilada
por Nutresa comprobando que el papel dice **Alpina**.

Un detalle de las pruebas que casi manda a arreglar algo que no estaba roto: una
punta sembrada con 0.9 m de fondo (las reales tienen 0.4) hace que sus propios
entrepaños tapen el panel pintado y sólo se vea producto en el hueco de arriba.
Con medidas reales llena los cuatro.

---

## El producto estaba pintado al fondo del mueble

Al ver la primera góndola vestida en producción saltó lo que ninguna prueba
podía atrapar: el producto **quedaba perdido al fondo**. Se veía un estante
vacío con algo dibujado atrás.

No era el arte. La imagen se pintaba sobre el panel **trasero** de cada mueble
—la espina de la góndola, la placa de la punta, la pared de la nevera—. Es el
sitio cómodo: esos paneles ya existen y ya heredan la transformación del
mueble, que es justo lo que hundió los dos intentos anteriores de poner
geometría nueva (replicaban la matemática de ubicación y se despegaban).

Pero en una góndola de 0.9 m de fondo eso deja el producto **44 cm detrás del
filo del entrepaño**. En una tienda el producto está adelante: eso es lo que
significa un *facing*, y es literalmente lo que el proveedor viene a comprar.

### La lámina

Ahora la imagen va en una lámina propia (`LaminaDeProducto`), parada a 5 cm del
plano exterior del mueble — lo justo para que el riel de precio y el filo del
entrepaño queden por delante, como en un lineal de verdad.

No repite la matemática de ubicación: es **hija del mismo grupo** que el mueble,
así que sólo conoce coordenadas locales. Ese era el error de los intentos
viejos, no la idea de tener geometría propia.

Dos detalles que la hacen funcionar:

* **El fondo de la lámina es invisible**, no del color del panel. Con un
  material opaco sería una placa tapando el estante entero; con
  `opacity: 0, depthWrite: false` sólo se ve donde hay producto.
* **`y` y `alto` son los mismos que tenía el panel pintado.** La textura viene
  compuesta con las filas alineadas a los entrepaños reales en el espacio local
  de ese panel, así que moverla en Z no toca la alineación — moverla en Y sí la
  rompería.

Se aplicó a los cinco tipos que se pintan: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los paneles estructurales volvieron a
ser lisos, y con eso `getPlainLambert` y `getPlainStandard` quedaron sin uso
—existían sólo para ser el fondo de una caja pintada— y se borraron.

### Lo que queda sabido

El producto se estira hasta llenar el alto del entrepaño: una bolsa de café de
25 cm ocupa los 39 cm del hueco. Es la convención del compositor de planograma
y para vender se ve bien, pero no es fiel. Arreglarlo pide saber el alto real
del empaque, que hoy no se pide al cargar el arte.

---

## Un solo nombre para el mueble

El panel del plano decía **«—»** en Nomenclatura mientras el plano dibujaba
`GON-800` sobre el mismo mueble. No era un bug de dibujo: eran **dos campos
distintos**.

* El **código** (`GON-800`) lo genera el sistema, se dibuja dentro del mueble y
  es la llave: forma el código de espacio que viaja al contrato, al correo del
  mercaderista y a la lámina.
* La **nomenclatura** era texto libre, opcional y aparte. Vacía en los 109
  muebles del plano real. Sólo se dibujaba como una píldora encima del mueble, y
  sólo si tenía valor — así que prender «Etiquetas» sobre un plano recién hecho
  no mostraba **ni una etiqueta**.

Lo que decidió el arreglo: **el resto de la app ya los trataba como uno solo.**
El minimapa, la pantalla de montaje, el tablero y el 3D mostraban
`nomenclatura || código`. El plano 2D era el único que los separaba, y su panel
el único lugar donde se veía «—» cuando el nombre efectivo era `GON-800`.

### La regla

> **Esto describe el modelo VIEJO, el de dos nombres, y se conserva porque
> explica de dónde salió el error de la fase 12.** Desde la fase 13 hay un solo
> campo: el `code` **es** el nombre. Ver §«Un solo nombre» más abajo.

`nombreDeMueble(mueble)` en `utils/nomenclatura.ts`: el nombre era el código que
puso el sistema, y escribir una nomenclatura lo **reemplazaba**. Se creyó que
eso daba una sola respuesta a «¿cómo se llama este mueble?». No la daba: la daba
en pantalla y no en la llave, que es donde se resolvían los contratos.

El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es
cómo se lo nombra.

### La píldora sólo dice lo que la caja no dice

Al principio la píldora se dibujó siempre con el nombre efectivo. Resultado: el
nombre aparecía **dos veces** por mueble —adentro de la caja y en la píldora
encima— y las píldoras chocaban con el mueble de arriba. Peor que antes.

Ahora sale sólo cuando el nombre **no** es el del sistema (`nombrePropio`). Si
es el heredado, la caja ya lo dice. Y escribir en el campo exactamente el mismo
código tampoco cuenta como nombre propio: no es un nombre nuevo, es el mismo.

### Lo que ve el usuario

* Sin nombre escrito: el panel dice `GON-800 · del sistema` en vez de «—».
* Con nombre escrito: el panel dice `P1-A`, y `P1-A` aparece sobre el mueble.
* Vaciar el campo devuelve el nombre del sistema; el placeholder del input es el
  propio código, para que se vea qué se hereda.

---

## Tres pedidos del uso diario

### El período, en «Estado por espacio»

La tabla **ordenaba por fecha de fin** y calculaba los días restantes, pero no
mostraba ni el inicio ni el fin. Para renovar —o para reclamarle a un
proveedor— hace falta saber desde y hasta cuándo, no sólo cuántos días quedan.
Ahora hay dos columnas, `Desde` y `Hasta`, apagadas cuando la cara está libre
(son historia, igual que el «último: proveedor» de al lado).

De paso: los encabezados alineaban por índice (`i >= 4` → derecha). Agregar una
columna en el medio corría la alineación de todas las de atrás, y ya dejaba
«Montaje» con el título a la derecha y el contenido a la izquierda. Ahora cada
columna declara su alineación.

### Ocupado es rojo

Es la convención de cualquier mapa de disponibilidad: verde se puede vender,
rojo no. Estuvo un tiempo en violeta para no chocar con el rojo de «vencido»,
pero **el mapa de la sede nunca dejó de pintarlo rojo**
(`components/FloorMap/zones.ts`), así que el mismo estado tenía dos colores
según la pestaña. Ahora es rojo en los cuatro lugares: plano 2D, editor 3D,
mapa de la sede y el chip que lo filtra en el tablero.

También el «Tomado» del mapa de Vender, que es el mismo hecho con otra
etiqueta: ese mapa queda verde / ámbar / rojo, que se lee sin leyenda.

Vencido comparte el rojo y no compite: es un subconjunto de lo ocupado, la
tabla lo dice con todas las letras y el filtro «Vencidos» lo aísla.

### El mostrador de servicio al cliente

Faltaba en el catálogo. Es `servicio_cliente`, prefijo `SAC`, 1.60 × 0.70 ×
1.10 m, y nace **no comercializable** —como las cajas— porque es operación de
la tienda y no espacio que se le venda a un proveedor; la bandera se puede
cambiar a mano si alguna sede decide alquilar ese frente.

Es más alto que una caja (1.10 contra 0.90) porque se atiende de pie y de
frente, no de costado con una cinta, y lleva un tramo bajo accesible en un
tercio del frente. Eso último no es adorno: es lo que lo distingue de una caja
al mirar el plano.

El cartel se monta sobre parantes que salen del propio mostrador. Colgado del
techo quedaba flotando —en el 3D no se dibuja techo—, así que un cartel
suspendido se veía suelto en el aire.

---

## La tienda no se parecía a una tienda

Tres cosas que faltaban para que el 3D aguante una reunión con un proveedor.
Ninguna cambia lo que el sistema hace: cambian si le creés.

### Piso de baldosa

El piso era una lámina de un solo color. Al caminar no había contra qué medir
el paso, así que avanzar por la tienda se sentía como flotar: no se sabía si la
punta estaba a tres metros o a diez.

Ahora es una textura de baldosa de 60 cm con junta, dibujada en un canvas y
repetida **por metro real** —la baldosa mide lo mismo en una sede de 12 m que
en una de 40—. La imagen lleva dos baldosas por lado y no una: así las juntas
quedan por dentro del dibujo y no sobre el borde, que es donde el filtrado
bilineal deja costura al repetir; las líneas de los bordes van a media caña y
al repetirse se suman en una junta completa.

Lleva **anisotropía al máximo del equipo**. Sin eso, mirando el piso casi de
canto —que es todo el rato en primera persona— la retícula lejana se deshace
en moaré.

### Muros, y sólo al caminar

Al caminar ya te frenaba `murosDeCaminata` en el perímetro, pero ese tope era
**invisible**: chocabas contra nada y te detenías. Eso no se lee como «llegué a
la pared», se lee como que el programa se trabó. El muro no agrega realismo:
hace honesto un límite que ya existía.

Van a 4,5 m —la altura de un supermercado de verdad—, con zócalo, y **sólo en
primera persona**: en la vista orbital, que es la que se usa para negociar,
taparían el plano.

Un detalle que sólo se vio mirando: quedaron **marrón sucio, más oscuros que el
piso**, al revés de cualquier tienda. La direccional principal cuelga a 40 m
casi a plomo, así que una cara vertical recibe N·L ≈ 0 y el muro se quedaba
sólo con el ambiente. Se levanta con `emissive` en el material del muro y no
tocando la luz de la escena, que ya está calibrada para los muebles. Medido
sobre la captura: muro (204, 200, 190) contra piso (205, 202, 195) — parejos,
que es como se ven de verdad.

**Techo no**, y es una decisión, no un olvido: taparía la única direccional
fuerte y habría que rehacer la iluminación entera; escondería el plano en la
vista orbital, obligando a mantener dos montajes de luz; y a 1,65 m de ojo con
fov 50° casi no entra en cuadro.

### Una persona de 1,70 m

Es lo que vuelve legible la escala. Un render sin nada humano al lado se ve
como una maqueta: el proveedor no sabe si su exhibidor le llega al pecho o a la
rodilla, y «1,80 m de alto» escrito en una ficha no se lee igual que verlo.

Aparece al lado del **mueble elegido**, no siempre. Va al COSTADO y no adelante
a propósito: adelante taparía justo la cara que se está vendiendo. Y no es
chrome — sale en la captura para el proveedor, que es donde hace falta.

`lugarDeLaFigura` vive en `utils/planta.ts` y está probada, porque el caso que
importa no es el de la sede de demostración. Prueba derecha, después izquierda,
y si en ninguna hay lugar **devuelve `null` en vez de plantarla igual**: con
doce góndolas sueltas cualquier lado sirve, pero en una sede de ciento
veintiséis un costado da al pasillo y el otro a la góndola de al lado, y una
persona metida adentro de un estante no aclara la escala — la arruina. El test
es el mismo con el que se camina (`chocaEn` sobre `murosDeCaminata`, que ya
infla cada huella por `RADIO_PERSONA` y respeta la rotación), así que la figura
se para exactamente donde podría pararse alguien.

### Lo que queda sabido

El remate del muro se ve desde lejos: sin techo, a más de unos metros el ojo
pasa por encima de los 4,5 m y aparece el fondo del lienzo. Es una transición
suave y no se lee como agujero, pero está. Subir el muro no lo resuelve —a 12 m
de distancia el cuadro llega a 7 m de alto—; lo resuelve un techo, y el techo
cuesta la iluminación.

---

## El conflicto no se podía resolver

El panel que ofrece «Usar la del servidor» / «Conservar la mía» se dibujaba
`position: absolute` dentro del `<header>`, y ese header lleva `overflow:
hidden` —está ahí para que la fila de pestañas no lo desborde en pantallas
angostas—. Resultado: del panel se veía **la tirita de arriba** y los dos
botones quedaban recortados fuera de la caja.

O sea que una sede en conflicto **no se podía resolver desde la interfaz**.
El indicador decía «Conflicto» para siempre, cada guardado seguía dando 409
(`pushSede` no reintenta una sede en conflicto sin `force`) y la única salida
era la consola del navegador. Le pasó a alguien con la única copia buena de
una sede encima.

Ahora el panel va por **portal a `document.body`**, `position: fixed`, anclado
al botón con `getBoundingClientRect` y reubicado en `resize` y `scroll`. Así
ningún contenedor lo puede recortar, sea cual sea el `overflow` de la cadena
de padres.

### Y dice los números

Elegir entre «la mía» y «la del servidor» a ciegas es lo que da miedo, y el
miedo es lo que deja una sede en conflicto durante días. El panel ahora
muestra **cuántos muebles hay de cada lado** —los locales salen del store, los
del servidor de `GET /layout/revisions`, que ya devolvía `count`— y una línea
que dice lo que el usuario necesita saber para animarse: *«Conservar la mía»
sube lo de esta computadora y pisa lo del servidor. No borra nada de acá.*

Es cierto y es la asimetría que importa: `resolveConflict(sede, "mine")` hace
un `pushSede` con `base_updated_at: null` y **no lee nada del servidor**;
`"server"` es el que descarta el trabajo local. `PUT /layout/{sede}` sólo
reemplaza el JSON de muebles de esa sede: espacios, contratos y montajes viven
en otras tablas y no los toca ninguna de las dos ramas.

---

## Los muebles se dibujaron a ciegas

El catálogo 3D se escribió a partir de la descripción de cada mueble, sin una
sola foto ni una referencia de otro programa. Eso dejó dos problemas de
distinta naturaleza, y el segundo es el que importaba.

### Ocho de los trece no se podían vestir

Probarle el producto del proveedor al mueble —la función por la que se cierra
un trato— **sólo funcionaba en cinco tipos**: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los otros ocho quedaban afuera, y no
por un olvido: el compositor sabía hacer una sola cosa, apilar filas de
facings sobre entrepaños. Una batea no tiene ninguna cara vertical que pintar.

Ahora hay **tres formas** de llevar producto, y cada tipo declara la suya en
`getPanelShelfSpan`:

| forma | qué es | quiénes |
|---|---|---|
| `estante` | filas de facings sobre entrepaños | góndola, punta, robatope, vitrina, nevera de refrescos, cruz, impulsador |
| `volcado` | producto a granel visto **desde arriba** | isla de piso, batea, isla fría, nevera de carnes, stand de frutas |
| `tira` | una columna de unidades colgadas | ristra |

`volcado` es la que faltaba, y es justo la mitad promocional del catálogo. Se
compone en el mismo canvas que las otras dos, tejiendo unidades de 13 cm con
las filas desfasadas y una rotación por celda —determinística, derivada de
`(fila, columna)`— para que se lea como un montón y no como una grilla.

### Ningún mueble inventa producto

La regla vieja era que cada malla traía su propio relleno: cajas de helado de
colores en la isla fría, un bloque verde en el stand de frutas, una losa roja
en la nevera de carnes, botellas rojas / naranjas / verdes / azules en la de
refrescos. Con el arte del proveedor cargado, **ese relleno se veía por los
huecos entre facings** y competía con la marca que acababa de pagar por estar
ahí.

Ahora el producto inventado se borró de todos, con una sola excepción
deliberada: la nevera de refrescos conserva botellas **mudas, de un solo tono
frío**, y sólo mientras el espacio esté sin vender. Una nevera vacía no se lee
como nevera; una nevera con seis colores de marcas que no existen le roba el
protagonismo a la que sí.

### Mueble por mueble

- **Isla fría.** Era un cajón macizo con un vidrio azulado adentro fingiendo
  el pozo, así que el producto quedaba enterrado en geometría y no se veía.
  Ahora el hueco es geometría de verdad: cuatro paredes de 5,5 cm sobre un
  cuerpo más bajo, y el producto apoyado en el piso del pozo.
- **Stand de frutas.** Dieciocho tablas apiladas hasta un metro: una ruma de
  madera. Un stand de verdad es un mesón con un cajón **poco profundo** arriba,
  para que la fruta quede a la vista y al alcance de la mano. El producto va
  adentro del cajón, no al ras del borde —al ras se veía como una tapa impresa—.
- **Exhibidor cruz.** Dos paneles del fondo entero, en gris casi negro, que
  enmarcaban el producto como dos paredes. Ahora se para en cuatro postes de
  esquina con travesaños, en metal claro, y lleva fondo: sin fondo, detrás del
  producto quedaba un hueco negro.
- **Góndola.** Se paraba en dos patitas, con el pasillo visible por debajo, y
  llevaba una barra blanca suspendida por encima sin apoyarse en nada. Ahora
  tiene zócalo corrido de punta a punta y un remate al ras sobre los montantes.
- **Batea.** El volcado flotaba en el aire, en el medio de la jaula. Se le
  agregó el **fondo falso** que toda batea tiene, que es lo que sube el producto
  cerca del borde. De paso, el riel de arriba cerraba 4,5 cm por encima del
  montante: era un aro suelto.
- **Vitrina.** En gris pizarra se leía como un electrodoméstico negro y le
  robaba el contraste al producto. Acero claro, y la tira LED del techo —que era
  una losa del fondo entero tapando el estante de arriba— quedó donde va, pegada
  al frente.
- **Isla de piso.** Tres bandejas de 10 cm flotando una sobre otra. Ahora es
  cartón escalonado macizo, cada andén una caja de altura completa, con el
  producto volcado sobre cada uno.
- **Ristra.** Se leía como un panel. Ahora es lo que dice el nombre: una
  columna de unidades colgadas.
- **Nevera de carnes** e **isla fría**: el volcado se había puesto *debajo* de
  una superficie interior que ya existía, así que no aparecía nada. Va sobre el
  cuerpo, bajo el vidrio.
- **Robatope.** El indicador de estado se montaba al 90 % de la altura, encima
  del producto. El estado es del sistema y no tiene por qué taparle la cara al
  proveedor: va abajo, como en todos los demás.

### Cómo se comprobó

Sembrando **los catorce del catálogo** (los trece que se venden más el mural)
en una escena y mirándola dos veces: una con el mismo arte cargado en todos
—para ver que ninguno queda sin vestir—, y otra con los espacios vacíos, que es
el estado en el que están casi siempre. Las dos capturas están en la conversación.

### Lo que sigue debiendo

El producto **se estira para llenar el hueco entre entrepaños**: el compositor
sabe cuántas filas caben pero no cuánto mide el empaque, así que una chocolatina
en una góndola de 38 cm de paso se dibuja de 38 cm de alto. Arreglarlo pide un
campo «alto del empaque» en el arte, no un cambio en las mallas.

---

## Pendiente urgente: datos de TERRON

TERRON tenía datos reales y **quedó vacía en el servidor**, vaciada por el bug del layout
vacío antes de que se desplegara el arreglo.

Procedimiento de recuperación, en orden:

1. **No abrir la app** en ningún equipo que pueda conservar la copia: al arrancar adopta la
   del servidor y sobrescribe la local.
2. En cada equipo, entrar a `https://retail-espacios.onrender.com/api/health` — esa URL
   devuelve JSON y **no carga la aplicación**, así que no dispara sincronización. Abrir la
   consola (F12) y correr:

   ```js
   const s = JSON.parse(localStorage['retail-fixtures-v1']).state;
   Object.fromEntries(Object.entries(s.fixturesBySede).map(([k, v]) => [k, v.length]))
   ```

3. Si TERRON aparece con fixtures, copiar la copia completa con
   `copy(localStorage['retail-fixtures-v1'])` y reconstruir la sede desde ahí.
4. Si ningún navegador la conserva, la vía es un **backup de la base** en Render. El botón
   *Rollback* del servicio web **no sirve**: revierte el código, no los datos.

---

## Renovar

Dos cosas, y ninguna es un tablero de estados.

**El botón.** Renovar no es abrir un contrato en blanco sobre el mismo mueble: es el mismo
acuerdo otra vez, y lo único que suele cambiar es el precio. El botón llega prellenado con
el proveedor, la marca y el valor QUE SE ESTÁ PAGANDO —no la tarifa de lista, porque lo que
se renegocia es lo que se paga hoy— y con el periodo arrancando **el día después** de que
termina el que corre, por el mismo largo. El día después y no el mismo: los dos extremos
cuentan como ocupados, así que arrancar el mismo día se solaparía con un contrato vivo y la
propia validación del formulario lo marcaría no disponible.

Aparece cuando el contrato se cae dentro de 60 días o ya se cayó, en la ficha del espacio y
en el globito del plano. Antes de eso no hay nada que renovar y el botón sería una trampa.
Al lado queda «Contrato con otro proveedor», que es el otro camino y conviene que se lea
como tal en vez de tener que deducirlo.

La semilla entra en la `key` del formulario a propósito: los campos se siembran en el
`useState` inicial, así que sin remontar, tocar «Renovar» con un contrato a medio armar en
pantalla no haría nada visible.

**Los recordatorios.** Existían y corrían —cada 12 horas desde `main`, y de arranque— pero
con tres cosas mal, y las tres importaban:

1. **Los hitos eran 30/15/7/1.** Son 30/15/6: a una semana ya no hay margen para negociar y
   a un día el correo avisa de algo que ya pasó.
2. **Se comparaba por igualdad exacta.** Si el servicio estaba dormido justo el día 30, ese
   aviso no salía NUNCA. En Render un servicio sin tráfico se apaga y el día que despierta
   rara vez es exactamente un hito. Ahora se busca el hito más chico que todavía cubre los
   días que faltan: un contrato a 28 días recibe el aviso de «30» —tarde pero llega— y uno
   que aparece a 5 días recibe UNO solo, el de «6», y no los tres de golpe. La marca en
   `NotificationLog` lleva el hito y no los días, para que un aviso tardío no se repita
   todos los días hasta el vencimiento.
3. **Iban a `notify_emails`**, la lista global vieja, mientras los correos de contrato ya
   iban por la libreta de contactos por sede. Con la libreta cargada y esa lista vacía —la
   instalación normal hoy— **el recordatorio no le llegaba a nadie** y sólo dejaba una línea
   en el log. Ahora va por la misma libreta que todo lo demás. Sin contactos no se manda y
   **no se marca**: marcarlo daría por avisado algo que no salió.

Lo que se descartó: un tablero de «en negociación / renovado / no renueva» con valor
propuesto, totales partidos y plaquitas por renglón. Se construyó y se tiró. En una pantalla
que ya tiene el plano, la lista de lo que se cae y la tabla de espacios, era una cuarta capa
de información para sostener a mano un dato que el contrato nuevo ya deja escrito.

---

## Backlog

1. **Histórico por espacio**. Es además prerrequisito de la tarifa de referencia: no hay
   tarifario público de exhibición en Colombia (los acuerdos son confidenciales), así que
   la única referencia calibrable es "a cuánto se cerró este mueble en esta sede antes".

Hecho en agosto 2026: tarifa de referencia por tipo y sede, disponibilidad por fechas,
calendario por temporada sobre el mapa, correos por rol y confirmación de montaje desde
el celular — ver "Qué está hecho". En septiembre: el botón de renovar y los recordatorios
de vencimiento arreglados — ver "Renovar".

No perseguir: pantallas digitales, sensores de impresiones, compra programática,
reconocimiento de imagen para auditar anaquel, y scorings de "tienda perfecta". Los tres
primeros porque el in-store retail media no llega al 1 % del gasto de retail media ni
siquiera para las cadenas grandes; el cuarto porque a tres tiendas gana un humano mirando;
el quinto porque mide la salud de la marca del proveedor, que no es trabajo del retailer.

### Sobre las cifras que solían estar acá

Este documento afirmaba que las puntas de góndola ocupan menos del 5 % del piso y mueven
el 30 % de las ventas de la categoría, con aumentos de 150–400 %. Se verificaron una por
una y **ninguna se sostiene**: el "30 %" se rastrea hasta un artículo de opinión que cita
un libro comercial sin metodología, el "5 % del piso" no aparece en ninguna fuente, y el
rango "150–400 %" sale de un blog de software que lo atribuye a *"industry data"*.

Lo que sí está medido (Nakamura et al., *Social Science & Medicine* 108, 2014, acceso
abierto): aislando la ubicación del descuento, el efecto de una punta va de **+23 % a
+114 %** según la categoría — y entre la mitad y dos tercios de la diferencia bruta que se
ve no es la ubicación sino el descuento y los facings extra que la acompañan. El gobierno
británico, con miles de millones de libras en juego, usó **55 %**.

Nada de esto cambia el backlog, que se justifica solo con inventario escaso y contratado.
Pero sirve en una negociación: si un proveedor llega con que la punta le multiplica las
ventas por cuatro, el número honesto es otro.

---

## La identidad, elegida en vez de heredada

Toda la paleta salía de los valores por defecto de Tailwind: `#7C3AED` era
`violet-500` sin tocar, los semánticos eran `green-700`, `amber-700` y
`red-700`, y el fondo `#F8F6F1` es el crema de la mitad de lo generado por IA.
La tipografía era **Geist**, que junto con Inter es la fuente por defecto de
los productos de IA de estos años. No estaba mal combinado: **no estaba
elegido**, y por eso se leía como plantilla.

Nada de lo nuevo salió de mi criterio. Cada valor tiene procedencia:

| Qué | De dónde |
|---|---|
| Tipografía **IBM Plex Sans / Mono** | `ui-ux-pro-max`, primer resultado de `--domain typography` para «professional data dense financial»: *financial, trustworthy, banking, enterprise* |
| Acento **`#00004D`** | Tema «Morgen Capital» de 21st.dev (`get_theme`, gratis) |
| Neutros fríos, acromáticos | Tema «PayMongo» de 21st.dev — su modo claro lleva croma 0 en todos los grises |
| Pastilla de estado con **fondo tintado + borde** | Componente «Leads Data Table» de 21st.dev (`get_component`) |

### Lo que enseñó el componente real

Mis propuestas anteriores eran **planas y tipográficas**; un tablero comercial
que se ve caro es **estratificado**. La diferencia concreta, sacada de leer el
código de un componente publicado:

- Cada estado lleva **terna**: tinta, fondo tintado y borde. No fondo solo.
- El borde es lo que le da canto a la pastilla y evita que se disuelva en la fila.

Eso destapó un defecto de información que llevaba tiempo ahí: `STATUS_META`
declaraba un campo `fill` que **no consumía nadie**, así que las ocho pastillas
de estado salían del mismo violeta y lo único que las distinguía era un punto
de 6 px. Un «Vencido» y un «Activo» se veían iguales de reojo — que es
exactamente como se mira una tabla de 126 filas.

### Detalles

- `tnum` y `font-variant-numeric: tabular-nums` van en el `body`, no sueltos:
  la mitad de lo que se lee acá son códigos, fechas y plata en columna, y con
  cifras proporcionales las columnas bailan al cambiar de valor.
- Las sombras pasaron de `rgba(31,27,18,…)` —marrón— a `rgba(11,18,32,…)`.
  Una sombra cálida bajo una superficie fría se ve sucia.
- El cajón oscuro también se enfrió, para que no convivan un gris cálido y uno
  frío en la misma pantalla.
- **La paleta del 3D no se tocó.** Los grises del acero, la madera del cajón y
  el piso de baldosa son mundo físico, no cromo: tienen que seguir
  pareciéndose a una tienda.
- **El semáforo conserva su significado.** Verde se puede vender, ámbar
  comprometido, rojo ocupado. Se recalibraron los valores para el papel frío;
  la convención no se movió.

---

## El sistema se llama RECABRA

Se llamaba **Galerías**, que es el nombre del cliente. Un sistema no puede
llevar el nombre de uno de sus clientes: el día que entre la segunda cadena,
el producto queda con la marca del competidor en la barra.

El nombre nuevo es **RECABRA**. Lo puso el dueño del producto. Queda dicho de
una vez lo único que hay que saber: la sílaba tónica es re-**CA**-bra, y
alguien va a hacer el chiste.

También se descartó **SIRESA** (*Sistema Retail Espacios Adicionales*), que era
la primera idea. La razón no fue de gusto: [Siesa](https://www.siesa.com/) es el
ERP líder de Colombia — 45 años, más de 10.000 clientes en Colombia, Perú,
Ecuador y México — y una cadena de supermercados colombiana probablemente ya lo
tiene instalado. Una letra de diferencia, mismo país, mismo comprador.

### Dónde estaba el nombre

Fue superficial, y conviene que siga así:

| Archivo | Qué |
|---|---|
| `frontend/index.html` | `<title>` — la pestaña |
| `frontend/src/pages/Dashboard.tsx` | la marca en la barra |
| `frontend/src/pages/Login.tsx` | la marca en el ingreso |
| `frontend/src/utils/planilla.ts` | nombre del Excel exportado |
| `backend/app/main.py` | título de la API y `/api/health` |
| `backend/app/services/mailer.py` | `MAIL_FROM_NAME` y el pie de los correos |
| `backend/app/routers/bulk_leases.py`, `notifications.py` | texto de los correos |

De paso salieron dos `#7C3AED` **hardcodeados** en plantillas de correo
(`bulk_leases.py`, `spaces.py`): el violeta viejo, que ya no existía en ningún
token. Quedaron en el acento nuevo. Los correos no pasan por Tailwind, así que
un cambio de paleta no los alcanza — cada vez que se toque la identidad hay que
revisarlos a mano.

### Lo que NO se tocó, a propósito

`backend/app/auth.py` tenía `"worker_password": "galerias"` como valor por
defecto, y `routers/auth.py` lo leía con `get_config(db, "worker_password",
"galerias")`. **Era la contraseña viva de los mercaderistas** si nadie la
cambió desde configuración, así que en el cambio de identidad no se tocó:
borrar ese default dejaba a la gente afuera de un día para otro.

*Actualización (fase 2 de seguridad, más abajo).* El default salió del código
—era la misma clave para todos los supermercados que instalen esto— pero la
contraseña **viva no cambió**: la que esté en la base sigue funcionando y se
convierte sola a Argon2 en el primer ingreso. Se cambia desde la pantalla de
configuración, no desde el código, y conviene hacerlo avisando.

---

## La línea visual: Empresarial

> **Arqueología (agosto 2026).** Esta sección y la que la precede cuentan de
> dónde salieron IBM Plex Sans, el acento azul y los neutros cálidos. **Ninguno
> de los tres sigue vigente**: el sistema actual es Chivo + Archivo Narrow sobre
> papel frío, y está descrito en «Paleta y tipografía» al principio de este
> documento. Se conserva porque explica el PORQUÉ de decisiones que todavía
> están en pie —dos radios y no seis, sin sombras ambientales, el acento en
> tinta para que el color quede sólo para el estado— y porque saber qué se
> probó y por qué se descartó vale más que el valor final. Ante cualquier
> contradicción, manda «Paleta y tipografía».


> **Esta sección quedó atrás.** Describe la dirección elegida en agosto de 2026,
> que es la que después recibió la devolución de que «se ve hecho con IA». La
> dirección vigente está más abajo, en «Rediseño de la pantalla principal»: la
> elegida es **q1 con injertos de q3**, maquetada en `docs/maquetas/`. Esta
> sección se reescribe cuando el rediseño baje al código; hasta entonces sigue
> describiendo lo que hay implementado hoy.

De seis líneas armadas en el prototipo, la elegida fue **Empresarial**.

| Token | Antes | Ahora |
|---|---|---|
| `--font-sans` | IBM Plex Sans | **Plus Jakarta Sans** |
| `--font-mono` | IBM Plex Mono | IBM Plex Mono *(sin cambio)* |
| `--accent` | `#00004D` navy | **`#0369A1`** azul de oficina |
| `--bg` | `#F2F4F7` | `#F8FAFC` |
| `--ink-1` | `#0B1220` | `#020617` |
| `--success` / `--warning` / `--danger` | `#0F7B4F` / `#9A6B0E` / `#C0392E` | `#15803D` / `#B45309` / `#DC2626` |
| Sombras | `rgba(11,18,32,…)` | `rgba(2,6,23,…)` |

**Una diferencia deliberada con el prototipo.** La línea Empresarial usaba
*una sola familia* — Plus Jakarta Sans también para el mono. Acá se mantuvo
IBM Plex Mono, porque `var(--font-mono)` está aplicado a los chips de código
(`ALF-GON-21`), a los ids de zona y a los inputs de tarifa, y ahí una retícula
fija sí paga. Además desde este contenedor no se puede verificar si Plus
Jakarta trae cifras tabulares, y si no las trae las columnas bailan — que es
justo lo que el `tnum` del `body` está ahí para evitar. Si se quiere una sola
familia, es cambiar un token.

**La marca en caps quiere tracking positivo.** `RECABRA` iba a heredar el
`letter-spacing: -0.015em` del nombre anterior, que está calculado para
minúsculas. En versales apretadas se lee como un error de impresión. Quedó en
`+0.055em` con peso 800.

---

## Fase 10 — El estilo de la landing adentro del sistema

**Decisión del dueño (2026-09-06).** «La landing quedó mejor que el diseño del
sistema; quiero aplicar el mismo estilo adentro.» Con tres respuestas: **claro
por defecto** (el oscuro a un clic), **amarillo solo en el botón principal** de
cada pantalla, y **arrancar por los tokens** (PR 1), después Vender con la
maqueta q1 (PR 2), después el resto (PR 3). Spec en
`features/diseno-interior/spec.md`; entregables en `outputs/` (tema.md con la
tabla token viejo → nuevo, frontend.md, auditor.md, verificacion.md y 61
capturas antes/después).

**Esto REVOCA la regla 4 del «Rediseño de la pantalla principal»** («nada de
ámbar, oro ni ocre, y nada de fondos oscuros»): el amarillo `--signal`
(`#FFD028`, botón `#F2B300` con borde `#A87C00`) entra acotado al botón
principal, uno por pantalla, y el oscuro entra como modo opcional que nunca es
el de arranque. Las otras tres reglas (la forma la manda el dato; pulcro;
cerrar trato y revisar cada uno en su modo) siguen vigentes y son el PR 2.

### PR 1 — un solo sistema de tokens (`frontend/src/tema.css`)

- **Tres capas**: primitivos de E (`--n-*`, `--p-*`, `--y-*`, `--st-*`),
  semánticos claro en `:root` y oscuro en `html[data-tema="oscuro"]`, y los
  DOS juegos de nombres (los viejos `--bg`, `--surface*`, `--line*`,
  `--ink-1..4`, `--accent*`, `--libre/--entra/--ocupado` + `-suave`/`-borde`/
  `-txt`, y los de E `--signal`, `--panel`, `--brd`, `--fg*`, `--t-*`, `--s*`,
  `--r-*`, `--sh-*`) apuntando al mismo valor. `index.css` quedó como capa 3
  (`.rotulo`, `.fig`, `.codigo`, `.btn-principal`, la regla del modal, los
  `--con-*` de la consola colgados del mismo interruptor).
- **Tailwind consume los tokens por canales** `rgb(var(--x-rgb) / <alpha-value>)`
  en vez de hex literales: la razón escrita en `tailwind.config.js`
  («`bg-accent/20` necesita un color legible») se respeta y sigue funcionando,
  y la consecuencia «si tocás uno, tocá los dos» se cae a propósito, porque un
  hex congelado no se entera del modo. `darkMode: ["selector",
  '[data-tema="oscuro"]']`. `probar:tema` compara config y tema.css token por
  token (por color resuelto) y falla si vuelve un hex ciego al modo.
- **Tipografía de E**: pilas de sistema (`--f-display` 800, `--f-text`,
  `--f-mono` con `tabular-nums`). Se fueron Chivo y Archivo Narrow y con ellas
  el `<link>` a Google Fonts: **cero orígenes externos en el dist**. Las dos
  razones escritas en `index.css` quedaron contestadas en `outputs/tema.md`
  §3: el total del contrato es una CIFRA y va en `.fig` (mono + tabular +
  700), no en un 900 de foundry; y la condensada hacía tres trabajos que ahora
  se reparten (cifras → mono; rótulos en versalita → texto 600, NO mono, que a
  9,5 px es ~18 % más ancho; códigos → mono con la columna en `ch`).
- **Toggle** sol/luna (`src/tema.tsx`): llave `recabra-tema`, claro por
  defecto, sin leer `prefers-color-scheme`, `useSyncExternalStore` sobre
  `html[data-tema]`. La consola de plataforma perdió su interruptor propio
  (`recabra-consola-tema` ya no existe: quien lo tenía abre en claro una vez).
- **Amarillo, uno por pantalla** (`.btn-principal`): Login (cuatro pasos
  excluyentes + el aviso de política), Vender «Guardar contrato y avisar»,
  Montaje «Confirmar», Reporte «Descargar JSON», Detalle «Reporte de
  transparencia», modales Carga masiva / Consentimiento / Catálogo de artes.
  Sin amarillo, con razón escrita: Supervisar (lectura), Montajes, Plataforma
  (los «Guardar» de fila siguen en `--con-accent`), Política, Configuración,
  Tarifas (no tiene Guardar: guarda con debounce). **Regla nueva**: con un
  modal abierto (`useModalAbierto()` → `html[data-modal-abierto]`), el botón
  principal de atrás pasa a tinta para que nunca haya dos amarillos.
  El «acceso anterior» del Login quedó en **tinta**: convive en la misma
  tarjeta con el ingreso por correo y el verificador midió los dos encendidos.
- **Barrido**: 259 clases literales de Tailwind fuera de la landing → 0, y
  cuatro copias a mano de la terna de estado (DashboardView, FloorPlan2D donde
  «ocupado» era violeta, `zones.ts`, y varios chips) → tokens. El editor 3D va
  en `[data-cajon-oscuro]`, que invierte los tokens adentro en vez de tocar
  sus ~35 `bg-accent`. **No tokenizar nunca**: los ~170 hex de materiales del
  editor 3D (son objetos físicos en una escena) ni `utils/propuesta.ts` (la
  lámina que se manda al proveedor es papel: blanca aunque el vendedor tenga
  el oscuro).
- **Contraste**: tres hex de tema.md corregidos con la medición (`--ink-3`
  claro `#54646E`, oscuro `#788A94`; `--signal-borde` `#A87C00`); `--ink-4`
  subió a `#68788A` / `#6E8190` porque SÍ se usa como texto («Administrador»,
  «sin tarifa», códigos a 10 px) y daba 3,6:1; `--brd-control` (sigue a
  `--ink-4`) para el borde de campos y selectores, que con `--line` daba
  1,35:1. Los `-borde` de estado NO dan contorno (1,3–1,8:1): el refuerzo del
  estado es la palabra al lado, que es regla dura; no el borde.

### El ingreso adentro de la landing

«Crear mi cuenta» y «Ya tengo cuenta» ya **no saltan a `/login`** (dueño,
2026-09-06: «la idea era poder ingresar ahí de una vez», y después: «¿tiene que
ser encima? ¿no hay manera de que convivan?»). Conviven: el formulario entra
**en la tarjeta del hero, al lado del plano, que sigue vivo** (se arrastra, se
acerca, se toca). La portada dispara `recabra:ingresar` (con `registro` o
`login`); `App.tsx` arma `components/IngresoPortada.tsx` y se lo pasa a
`<Landing ingreso={…}>`, que lo pone en lugar del texto del hero y sube la
página hasta ahí (el pedido puede venir del pie). Adentro va el `Login` de
siempre, perezoso, con `enHoja` (sin pantalla completa ni tarjeta) y
`modoInicial`. «← Volver a la portada» y Escape devuelven el texto.
Mientras está abierto, el `<html>` toma el tema de la landing (oscuro salvo
que la portada esté en claro) para que los tokens de :root del formulario
pinten a juego; al cerrar vuelve el del interior. El `href` a `/login` queda
de respaldo (clic con modificadores, sin JS), y `/login` sigue existiendo para
la invitación, los enlaces guardados y el 401.

**Frontera intacta:** la landing sigue sin importar sesión ni API (recibe el
formulario armado por `App.tsx` como `ReactNode`; no sabe qué es).
`test_landing_ataques.py` definía el «núcleo» de la landing como *todo archivo
nuevo de la rama bajo `frontend/src`* (muleta de la construcción de la Fase 9):
con la Fase 10 eso metía `tema.css` y el ingreso adentro del núcleo. Ahora el
núcleo es lo que se llama «landing» (`pages/Landing/`), que es lo que es.

**Gotchas del formulario adentro de `.lp`:** (1) los resets de la landing
(`.lp a`, `.lp button`) no entran en `.card--ingreso`, con `:not(:where(…))`
para no subir la especificidad (sin `:where` el reset le ganaba a `.lp .tool`
y a `.lp .btn` y les borraba el borde); (2) `.lp .rotulo` pasó a
`.lp .hud .rotulo`: le estaba aplicando el pill flotante del plano al
«Acceso anterior» del formulario; (3) con el ingreso abierto
(`.lp[data-ingreso="1"]`) el HUD del plano baja de z-index, porque en el
celular la tarjeta pasa por debajo y el HUD le robaba los toques.

### Gotchas de la Fase 10

- **La terna oscura de estados reprueba la banda de claridad de `dataviz`**
  (`validate_palette.js --mode dark` sale con exit 1 por luminosidad, no por
  separación). Se aceptó a propósito: son los hex de E validados en la landing
  y la separación entre pares pasa; el detalle está en el encabezado de
  `tema.css`.
- **La condensada vs la mono.** Los códigos `GON-140·A` pasan de 69 a 82 px.
  La columna de código de Supervisar pasó de `width: 56` (que ENVOLVÍA en dos
  renglones 3 de 9 filas: bug preexistente) a `min-width: 9ch`, y quedó en un
  renglón. Pero el **rótulo sobre el mueble del plano isométrico** se desborda
  7,6 px en los códigos de 7 caracteres (antes 0,8): no es recorte ni choca
  con otro rótulo, pero el margen se consumió. Es forma → PR 2.
- **El plano isométrico memoiza la escena** (`IsoMap`, `useMemo`) y pinta con
  `temaActual()` adentro: el tema tiene que ser dependencia o el sol/luna deja
  la terna vieja hasta recargar.
- **Sin navegador en el sandbox de los agentes**: el frontend no pudo mirar
  ninguna pantalla; el verificador sí (Chromium de Playwright preinstalado) y
  además tuvo que servir Chivo/Archivo Narrow por `page.route` para que el
  ANTES no midiera con la fuente de respaldo. Y las pilas de sistema resuelven
  a Liberation/DejaVu en Linux: en macOS la mono es más angosta, en Windows
  más ancha.

### Pendientes para el PR 2 (Vender) y el PR 3

**Cerrados por el PR 2** (Vender con la forma de D — más abajo):

- ~~Rótulo del mueble en el plano isométrico (desborde de 7,6 px)~~. El rótulo
  se rehizo entero: dos `<tspan>`, halo por `paint-order` (sin caja de ancho
  fijo, que era lo que desbordaba), cuerpo **constante en pantalla**
  (`--lbl` = 10,5 px ÷ escala) y un deschocador que calcula en vez de medir el
  DOM. Medido: **0 choques y 0 textos cortados** a 1× / 1,56× / 1,95× y en 27
  encuadres de rueda, en los dos modos. `EXH-CENTRAL` en el **FloorMap** sigue
  pendiente: ese es otro componente y no entra en Vender.
- ~~`DISPLAY_TOP` del plano: siete clases sobre cuatro colores validados~~.
  Resuelto por las dos puntas: **del plano se borró** (el mapa siempre tiene
  periodo, así que `topColorFor()` era código muerto y ahora pinta siempre la
  terna validada `RANGE_TOP`) y **de la tabla y el popover se quedó, pero sobre
  los cuatro colores validados**: se fueron los dos tintes al 60 % que nadie
  había validado. Cuatro de los siete estados comparten color y cada uno va con
  su palabra al lado, que es la regla del sistema. El porqué está escrito en
  `DashboardView.tsx`, sobre `ESTADO_CLARO`.
- ~~Escala tipográfica~~. Los ocho pasos `--t-*` pasaron a los valores de D
  (10 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 21 · 30). En Vender se renderizan
  **nueve cuerpos y ninguno más**: los ocho pasos más el rótulo constante del
  plano.
- ~~`StoreView.tsx` y `Legend.tsx`~~: borrados.

**Siguen abiertos:**

- `--s5/--s6` (24/32) vs Tailwind `p-5/p-6` (20/24): conviven a propósito.
  Vender ya no depende de eso —su composición es una rejilla propia— pero el
  desfase sigue.
- `EXH-CENTRAL` en el FloorMap se desborda de su caja en las dos versiones.
- El «Guardar» del plano en el Editor 3D quedó en tinta y el del modal de artes
  en amarillo: probablemente al revés; decisión del dueño.
- Paletas categóricas por TIPO de mueble (`FloorPlan2D`, `fixtureStore`,
  `zones.ts`): a ojo, sin validar; y el color de cada mueble queda GUARDADO en
  datos, así que moverlas toca datos.
- `--con-*` de la consola de plataforma reprueban contraste en los dos modos
  (`#8E979B` sobre blanco 2,98:1 ×33 nodos): preexistente, PR 3.
- **Las dos barras.** Vender tiene encima la barra de la aplicación (51 px,
  compartida con Montajes / Plano / Editor 3D) **y** la de la pantalla (40 px
  apretada). D tenía una sola —su rail ERA la barra—, así que la hoja del
  sistema arranca con ~43 px menos de alto que la que aprobó el dueño. Eso
  corre dos umbrales: la válvula de la ficha del contrato se abre en el tercer
  espacio a 1440×800 en vez del cuarto, y por debajo de 790 px de alto la
  pantalla rueda (en D era 760). Fusionar las dos barras es PR 3.

### PR 2 — Vender con la forma de D

La opción elegida por el dueño es **D · «La fusión»**
(`features/diseno-interior/outputs/vender/opciones/D-fusion/`), y el port está
en `features/diseno-interior/outputs/vender/port-frontend.md`: qué se portó tal
cual, qué se adaptó a los datos reales y las mediciones.

Lo que hay que saber para no deshacerlo sin querer:

- **La hoja.** `/` en modo Vender es una rejilla de cuatro paneles numerados
  (`01` plano · `02` escalera · `03` contrato · `04` tarifa) que llena la
  ventana, con un piso por fila (`--fila1` / `--fila2`), un apretón bajo 880 px
  de alto y scroll normal bajo 790. **No hay scroll de documento y no hay nada
  escondido adentro de un panel**; la única válvula declarada es la ficha del
  contrato, que rueda —con su barra a la vista— del cuarto espacio en adelante
  en 1440×900. Todo cuelga de `.vender` en `src/vender.css`: Supervisar,
  Montaje y el editor 3D no ven una sola de esas reglas.
- **El rótulo del plano no se mide con `getBoundingClientRect` en el mismo
  paso.** `acomodar()` es aritmética pura sobre un tamaño medido UNA vez
  (`calibrar()`, en el segundo cuadro y repetido hasta que dos pasadas
  coinciden) y sobre la cámara recién escrita. Si alguien lo «optimiza»
  midiendo el DOM ahí, vuelven los choques a 0,8× y a 2,4×. La cámara
  (`zoom`, `T`) tampoco es estado de React.
- **El resaltado es una sola función** (`destacar`), imperativa: apaga la sala
  al 20 % por CSS y enciende con `classList`. Con estado de React, pasar el
  mouse por una fila de la tarifa repintaría 106 prismas por cada píxel.
- **Los conteos se derivan.** La clave del plano, la columna «Libres · entran»
  y el pie de la tarifa son la misma cuenta mirada tres veces, y descuentan lo
  que ya entró al contrato. Ningún número escrito a mano.

## Fase 11 — La Plataforma como espacio de análisis y asesoría

**El pedido del dueño (2026-09-07).** Al abrir el detalle de un cliente en
`/plataforma`: «un montón de información sin orden, súper largo, sin entender
qué era cada cosa». La consola tenía los datos y no tenía la historia. La
referencia pedida fue el **storytelling de científicos y analistas de datos**, y
el encargo se escribió sin ninguna referencia visual (`features/plataforma-asesoria/brief.md`),
para que los diseñadores no copiaran lo que ya había.

Tres direcciones a ciegas, medidas por un director de arte sin elegir
(`outputs/COMPARATIVA.md`): **A · El informe** (documento que se lee de arriba
abajo), **B · El tablero** (hoja sin scroll con capítulos navegables) y **C · La
conversación** (tarjetas de acción con evidencia desplegable). El dueño eligió
**A tal cual**, después de ver y descartar una fusión de A con la organización
de C: «no me gusta nada la vista dividida y la cantidad de letra grande con
negrilla». Esa frase es la regla de la fase: **no se agranda ni se engruesa
nada**, y no hay paneles que partan la pantalla.

### La decisión de fondo: la consola es un documento

Tres piezas navegables entre sí, cada una contestando una pregunta:

| Pieza | Ruta | Contesta |
|---|---|---|
| **La cartera** | `/plataforma` | ¿cómo va el negocio y a quién llamo primero? |
| **La sesión** | `/plataforma/clientes/:slug` | ¿qué le propongo a este cliente? |
| **El informe** | `/plataforma/clientes/:slug/informe` | ¿qué gano yo, gerente de supermercado? |

Cada bloque abre con su **frase-conclusión con cifra** y, debajo, **la ruta
exacta del JSON en monoespaciada** (`cartera.clientes[].metricas ·
tendencia_cliente.serie[2026-08]`). Eso último contesta solo la pregunta que el
dueño hace siempre: ¿de dónde sale este número? El detalle va plegado en
`<details>`, no en un panel aparte.

**Una sola acción principal por pantalla**, en amarillo, y es la que sigue en el
trabajo: en la cartera la llamada #1 de la cola, en la sesión «Armar el informe
para el cliente», en el informe «Imprimir o guardar en PDF».

### La forma de cada dato

El corazón del encargo era **qué gráfico le toca a cada dato**, no decorar. Los
diez dibujos viven en `frontend/src/components/plataforma/graficos.tsx` como SVG
dibujado a mano (cero librerías, cero recursos externos) y su tabla completa
está en `components/plataforma/README-graficos.md`. Los desvíos que se ganaron
el lugar:

- **La ocupación de la cartera es un medidor; la del cliente, unidades.** Para
  un cliente las 254 marcas *señalan un lugar al que ir*; para la cartera, 513
  marcas —3.000 con 30 clientes— no señalan nada.
- **La tendencia se dibuja en CONTEOS, no en porcentaje.** El denominador se
  mueve cuando entra o sale un cliente, y una línea de porcentaje dibuja un
  derrumbe que no ocurrió. Dos líneas de conteo en una sola escala, y la
  ocupación se lee como la brecha. El mes sin snapshot es un **hueco**, no una
  recta entre vecinos.
- **Las barras de sede miden espacios, no porcentaje**, y el «contra qué» es una
  **marca por barra**: dónde terminaría lo ocupado si esa sede estuviera en el
  promedio del cliente. Con barras de % dos sedes de tamaño muy distinto dibujan
  la misma barra y no son el mismo negocio.
- **El riel de vencimientos es de 60 días**, que es `DIAS_POR_VENCER` y lo que
  el backend mira. Uno de 90 deja un tercio vacío que se lee como «no hay
  vencimientos», y no es cierto: es que no se miran.
- **El valor en juego son tres cifras, no una**, y la suma no se muestra: sumar
  las recomendaciones cuenta dos veces los mismos espacios y mete adentro
  ingreso que ya entra.
- **El último mes de las barras divergentes se rotula con su SALDO**, con signo
  y con la palabra. Rotularlo con las entradas anunciaba «+$ 0,6 M» a diez
  píxeles de la anotación que decía, del mismo mes, «el peor saldo de la
  ventana: −$ 1,4 M». Lo fijan los casos 17 y 18 del banco de `probar:graficos`.

**Una escala por gráfico, nunca dos ejes.** Todo texto adentro de un SVG entre
10 y 30 px reales en pantalla: el contrato de tamaño (`viewBox` del tamaño de la
caja + `width:100% · min-width:W · height:H` + `xMinYMin meet`) fija el factor de
escala en 1, así que el cuerpo declarado es el cuerpo que se ve.

### Reglas de color que esta fase agrega

- **Los tres estados de espacio (`--libre / --entra / --ocupado`) sólo codifican
  estado de espacio.** Señal, estado de cuenta, prioridad y cobertura van en
  **chip gris con la palabra escrita**. Se escapó una vez y de la peor manera:
  `--entra-txt` **colapsa con `--entra` en el tema oscuro** (`tema.css`), así
  que un chip que en claro era ámbar oscuro en oscuro pasaba a ser exactamente
  el color del estado. Por eso `probar:plataforma` mide el color **computado en
  los dos temas**, no el token escrito.
- **`--ink-4` no se usa para texto sobre el papel**: 3,98:1. Va `--ink-3`.
- Un `.btn-principal` por pantalla y `var(--signal)` fuera de esa clase = 0.

### La frontera, que es lo que no puede fallar

La sesión y el informe abren el negocio de un cliente espacio por espacio, así
que la fase se auditó como frontera y no como pantalla:

- **La tarifa de referencia de un cliente NUNCA se pinta.** Sólo su relación
  (`spread_pct`) y el sí/no de `tarifa_configurada`. Se verifica sembrando una
  tarifa con un valor reconocible y buscándolo en `innerText`, en los textos de
  los SVG, en `title`/`aria-label`/`alt` y en el `outerHTML` entero con todos
  los `<details>` abiertos.
- **El informe no lleva nada interno**: ni cartera, ni señal, ni fantasma, ni
  adopción, ni benchmark de otros, ni nombres de otros clientes.
- **Todo es de sólo lectura** salvo el estado de cuenta y las supresiones, que
  siguen siendo operaciones y viven en su cajón.
- **Backend sin una sola línea de cambio**: `git diff origin/main -- backend`
  vacío es una afirmación de `probar:plataforma`. El reporte de transparencia se
  enlaza y no se rediseña.

### Dos cosas que costaron y conviene no repetir

- **El informe no heredaba el periodo.** Con la sesión en julio, «Armar el
  informe» pedía septiembre y titulaba septiembre: un documento impreso con un
  mes que el asesor no eligió, y nada en pantalla lo decía. Ahora **la URL es la
  fuente** (`?periodo=`) y las cuatro líneas que decían «el mes en curso todavía
  no terminó» salen del periodo que devolvió el backend, no de la fecha de hoy.
- **`<input type="month">` no sirve para esto.** Chromium lo pinta en el idioma
  del navegador («September 2026» en una pantalla íntegramente en español) y a
  390 px se corta. Va un `<select>` armado con los periodos que de verdad
  existen en la serie, en español, con los meses sin snapshot deshabilitados y
  rotulados «· sin dato».

### Cómo se prueba

`npm run probar:graficos` levanta su propio Vite sobre un banco de casos
(`frontend/pruebas/graficos.html`) y mide, en claro y oscuro y a dos anchos, que
ningún texto de un SVG baje de 10 px ni pase de 30, que ninguno se pise con
otro, que ninguno se salga de su caja, y las dos ramas del rótulo del último mes
de las divergentes. `npm run probar:plataforma` afirma la frontera: los campos
que no existen en `api/plataforma.ts` no se leen, los colores de estado no
codifican otra cosa, el informe hereda el periodo, hay un solo interruptor de
tema, cero código muerto en el área y el backend no cambió; con la app corriendo
(`PROBAR_PLATAFORMA_URL` y `PROBAR_PLATAFORMA_TOKEN`, receta en la cabecera del
archivo) agrega las afirmaciones sobre las tres pantallas de verdad.

**El que deja el Vite vivo rompe la corrida siguiente.** `probar:graficos`
prometía matar su servidor y no lo hacía: lanzaba `npx vite`, y matar al `npx`
deja al `vite` huérfano. Ahora se lanza el binario local en su propio grupo de
procesos y se mata el grupo entero, colgado de un `try/finally` más handlers de
señal. Con `--strictPort`, un puerto ocupado se dice en vez de colgarse.

## Herramientas de diseño en el repo

`.claude/skills/` trae **ui-ux-pro-max** (MIT, `nextlevelbuilder/ui-ux-pro-max-skill`),
instalada con `npx ui-ux-pro-max-cli` → `uipro init --ai claude`. Son siete
skills —`ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`, `slides`,
`banner-design`, `design`— con un catálogo local que se consulta con Python 3
de la librería estándar: **79 estilos, 192 paletas de producto, 74 pares
tipográficos, 119 guías de UX, 105 iconos, 25 tipos de gráfico y 22 stacks**.

```bash
# Dirección visual completa para un producto
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<producto> <rubro> <claves>" --design-system -p "Galerías"
# Un solo tema
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant serif" --domain typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "glassmorphism"  --domain style
```

Los scripts **no instalan nada y no hacen llamadas de red**: leen los CSV de
`data/`. Para actualizar, `uipro update`.

Está commiteada a propósito y no en `.gitignore`: el contenedor de una sesión
remota es efímero, así que si no vive en el repo hay que reinstalarla cada vez.

**Por qué está acá.** La paleta del sistema salía entera de los valores por
defecto de Tailwind —`#7C3AED` es `violet-500` sin tocar, los semánticos son
`green-700`, `amber-700` y `red-700`, el fondo es el crema de la mitad de lo
generado por IA—, y ese es el motivo de que se lea como plantilla. El catálogo
existe para que la dirección visual se elija de una lista razonada en vez de
inventarse. **La decisión de qué dirección tomar sigue sin estar tomada.**

---

## Rediseño de la pantalla principal

**Estado: elegida, sin implementar.** De cuatro finalistas quedó **q1**, con
injertos de q3. La maqueta vive en `docs/maquetas/elegida-vender.html`. Nada de
esto está en el código todavía.

Al presentar el sistema, la devolución fue que **«se ve muy obvio que es hecho
con IA»**. Lo que siguió fueron seis rondas y veinte maquetas. Vale la pena
dejar escrito qué falló, porque el camino explica las cuatro que quedaron.


**Conciliación al cierre (verificador de la ronda 2).** (1) A 390 px la
escalera tenía 10 choques de texto porque el `viewBox` seguía a la caja
angosta; ahora la caja mide 880 px (como D), se desliza dentro del panel y
arranca por los escalones: 0 choques a 390 y a 1440, sin desborde de la
página. (2) `probar:vender` aseveraba la escala tipográfica sobre TODO
`DashboardView.tsx`, incluidos los 69 literales de Supervisar (PR 3); ahora
asevera sólo sobre lo que pinta Vender. (3) Diferencias con D aceptadas a
propósito: el periodo vive en la barra de la pantalla (es el selector real,
no un rótulo); la acción secundaria es «Empezar de nuevo» (la app no tiene
«guardar como reserva»); la clave dice «Se libera en el periodo»; la ficha
suma «+ Correo, nota y planometría» (campos reales); la ubicación va en dos
renglones con puntos suspensivos (la ficha tiene que cerrar con tres espacios
y 12 px de aire). (3b) El dueño pidió de vuelta **las pastillas de código bajo cada tipo de la
tarifa** (el diseño anterior), con la tarifa abajo (panel 04) y conservando el
resaltado: la fila enciende los muebles del tipo, la pastilla enciende ESE
mueble, y el clic lo suma al contrato. Sólo mientras no hay contrato armado.
La tabla rueda por dentro con barra a la vista y el pie queda pegado abajo
(`position: sticky`). (4) Pendiente al PR 3: **las dos barras** (la de la app y la
de la pantalla) le quitan ~43 px de hoja respecto de D y corren el umbral de
rodar de 760 a 790 px de alto; fusionarlas devuelve el comportamiento exacto.
El plano no rotula ENTRADA/CAJAS (no existen en los datos).
### Lo que no funcionó

**Sacar los tells no alcanza.** La primera pasada quitó gradientes, sombras,
esquinas redondeadas y la paleta por defecto. El resultado fue rechazado: quitar
las señales deja una interfaz *neutra*, que es otro género reconocible. La
sustracción no produce una identidad.

**Partir de lo que ya existe ancla.** Cinco propuestas hechas sobre la base de
la que más gustaba dieron cinco rechazos: convergieron a variaciones en vez de
proponer. Diseñar a ciegas —sin ver el sistema actual ni ninguna propuesta
previa— es lo único que produjo un acierto.

**Imitar un género conocido da un resultado correcto y anónimo.** Se probaron
cinco variantes con la estética del software empresarial que corre adentro de
una bodega (SAP, Siesa, Oracle, WMS). Ninguna gustó, y además se salieron de los
datos reales: inventaron razones sociales formales con NIT porque los nombres
verdaderos —«brayan», «camilop»— no encajaban en la estética.

**Agregar texto que explique tampoco.** Una versión abría con un párrafo que
contaba el hallazgo en prosa. La respuesta fue: *«no me refiero a poner más
texto, me refiero a que la forma de presentar los datos sea la más óptima para
lo que están diseñados»*. Si hace falta una frase para explicar un gráfico, el
gráfico está mal elegido.

### Los criterios que quedaron

De rechazar dieciséis propuestas salieron cuatro reglas, en palabras del dueño
del producto: **un sistema pulcro, que cada cosa esté ahí por algo, que pueda
cerrar trato y revisar información todo a la mano.**

1. **La forma la manda el dato.** Una magnitud sola es una cifra, no un anillo
   de progreso. Unas partes de un total quieren verse sumar. Un ranking quiere
   estar ordenado. Unos hechos con fecha quieren un eje de tiempo, no una tabla
   ordenada por días. Una cantidad que hay que contar se cuenta mejor en
   unidades discretas que en un porcentaje. **Si dos elementos dicen el mismo
   dato, uno sobra.**
2. **Pulcro.** Recorrer la pantalla elemento por elemento preguntando «¿esto qué
   hace?». Lo que no contesta, se va.
3. **Cerrar trato y revisar, cada uno en su modo.** El formulario del contrato
   no puede ser un globo que aparece al hacer clic: si armar el contrato es la
   mitad del trabajo, la mitad del trabajo tiene lugar fijo.
4. **Nada de ámbar, oro ni ocre, y nada de fondos oscuros.** Descartados
   explícitamente.

### Las dos restricciones que aparecieron en el camino

**Vender la ve el proveedor.** Es la más importante y no estaba en ningún lado.
El administrador **gira el portátil y le muestra la pantalla al proveedor que
tiene enfrente**, así que Vender no es una pantalla interna: es material de
venta que un tercero lee.

Eso vuelve prohibido en Vender: el nombre de otro proveedor, lo que paga otro
proveedor, el ranking por canon, quién está por debajo de tarifa, el canon total
de la sede, la plata del periodo y cuántos contratos vencen. Sólo va
**disponibilidad, tiempo, el espacio en sí, el contrato de ESE proveedor y la
tarifa de referencia**, que es lista de precios y sí es pública.

Una propuesta anterior ponía, al lado del campo de precio, una barra comparando
el canon ofrecido contra el de los otros tres proveedores, con nombre y monto.
Es un gráfico excelente y es una fuga de información confidencial. Dos de los
cuatro finalistas lo auditan por `grep` sobre su HTML final.

**El plano isométrico va en los dos modos.** Es lo único que este sistema tiene
y una planilla no puede tener: el inventario tiene domicilio, y quien vende
señala el piso. En Vender es el catálogo que se le muestra al proveedor; en
Supervisar es el estado de la sala de un vistazo.

### El color se valida, no se elige a ojo

La combinación **verde + naranja falló** el validador de la guía de
visualización: se confunden con protanopía, que es el daltonismo más común, y en
esta pantalla eso separa «libre» de «ocupado» (ΔE 5,3, muy por debajo del piso).
Ninguno de los cuatro finalistas la usa. Todos llegaron a `ALL CHECKS PASS`
antes de entregar.

```bash
node /tmp/.../dataviz/scripts/validate_palette.js "#hex,#hex,#hex" --mode light
```

### Los cuatro finalistas

Los cuatro trabajaron a ciegas y comparten escuela —sistema de administración de
comercio, tomando su estructura y no su piel—, porque de dieciséis propuestas de
escuelas distintas ésa fue la elegida. Lo que varía es dónde gasta cada uno el
riesgo.

| | Dónde puso el esfuerzo | Lo que aporta que los otros no |
|---|---|---|
| **q1** | El plano isométrico | Las fechas de liberación sobre el propio mueble («libre 25 sep»). En Supervisar, el canon en barra con la tarifa como línea y en rosa lo que falta |
| **q2** | Vender como material comercial | Botones para calcar el periodo de una temporada; el aviso «Amor y Amistad cae adentro» como argumento de venta |
| **q3** | La densidad de Supervisar | La banda de liberación día a día, y **contratar varios espacios en un solo contrato** — un proveedor no negocia una punta suelta |
| **q4** | El estado y la tipografía | Trama en vez de más colores (se lee en blanco y negro); **el frente en metros**, que es lo que el proveedor compara; la tarifa sólo del espacio elegido |

Las ocho pantallas, sus notas de diseño, el brief, los criterios y el prompt
completo están en `docs/maquetas/`. Van con sus tipografías en disco porque el
navegador donde se hicieron no llega a Google Fonts.

### La elegida: q1, con injertos de q3

Ganó **q1** por el plano isométrico —que es la pieza que ninguna de las otras
mejoró— y por las fechas de liberación escritas sobre el propio mueble. De q3
se injertaron dos cosas: **contratar varios espacios en un solo contrato** (un
proveedor no negocia una punta suelta) y el bloque **«cuándo se libera cada
espacio»**, aunque no su forma.

**El calendario comercial de q2 se descartó después de probarlo.** La cuadrícula
del mes repetía lo que ya dicen la banda de temporada del gráfico y los sellos
del contrato («Cubre Amor y Amistad»), y no agregaba ninguna decisión.

**La forma del bloque de liberación se rehízo cinco veces**, y la discusión vale
la pena porque se repite cada vez que hay que graficar algo acá. Las cinco están
guardadas: `docs/maquetas/opciones-libera.html` compara cinco formas distintas y
`docs/maquetas/variantes-a.html` cuatro maneras de leer la que ganó.

- q3 lo dibujaba como **una barra por espacio** sobre un eje de fechas: barra
  azul hasta que se libera, verde después. Gastaba todo el ancho pintando lo
  *ocupado*, que es justo lo que no se vende, y dejaba la fecha —el dato— como
  una astilla contra el borde derecho.
- La segunda fue **área escalonada con los códigos flotando sobre los
  escalones**. La forma era correcta pero los chips se pisaban entre sí y contra
  el borde.
- La tercera movió los códigos a **una columna al costado**. Dejó de chocar,
  pero partió el bloque en dos piezas que hay que juntar con la vista.
- Se pusieron a competir **cinco formas distintas** —escalera, inventario por
  tipo, tira del mes, agenda sin gráfico, un punto por espacio—, cada una
  contestando una pregunta distinta. Ganó la escalera, que contesta «¿cuántos
  tengo si el cliente arranca el día X?».
- La que quedó es **A·4: escalera sobre el eje de fechas, a todo el ancho**.
  Cuatro decisiones que conviene no deshacer:
  - **Sin columna lateral.** A 1024 px quedan 66 px entre el 25 y el 27 de sep y
    un chip mide 56: los códigos caben debajo de su fecha sin pisarse. Eso es lo
    que permite dejar un solo bloque. **Si el panel se angosta, los chips
    vuelven a chocar y hay que reponer la columna.**
  - **Sin eje vertical.** El rango es 15 a 20; una escala completa sería adorno.
    Cada tramo va rotulado con su cifra, puesta al inicio de su meseta para que
    quede pegada a su escalón.
  - **Peine de días.** Un diente por día bajo el eje: los 25 días planos se leen
    como tiempo que pasa y no como espacio sobrante.
  - **El cursor escribe la lectura.** En la maqueta está parado en una fecha de
    ejemplo («si arranca el 26 de sep → 17 libres»); en el sistema sigue al
    mouse. Es lo que convierte el gráfico en una respuesta.

Se descartó a propósito la variante con **techo en 23** (los espacios
comercializables de la sede). Hace legible la proporción —15 de 23— pero
aplasta el escalón contra el borde superior, y el escalón es el dato que se
está negociando. Si alguna vez pesa más la proporción que el ritmo, ahí está.

Un detalle de color de esa variante que sirve de precedente: sus bandas son
**un solo tono con luminosidad descendente**, no tres colores. La versión con
gris para «tomados» daba ΔE 4.0 en deuteranopía contra el verde claro. La rampa
validada da ΔE 14.2 en protanopía y 18.4 en visión normal, y cada banda va
rotulada, así que la identidad nunca depende sólo del color.

### La paleta y la escala de letra

**Verde: se puede vender. Rojo: no.** El azul que marcaba «tomado» se fue: no
decía nada por sí solo y obligaba a mirar la leyenda. Los cuatro estados quedan
así, y valen tanto en el plano como en el gráfico y en las tablas:

| Estado | Color | Dónde |
|---|---|---|
| Libre todo el periodo | `#00786A` | plano, línea del gráfico, cifras |
| Se libera en el periodo | `#F08519` | plano, chips de códigos |
| Tomado todo el periodo | `#8E1226` | plano |
| Resto de la sala | `#D3D9DB` | plano |

**El rojo es oscuro a propósito.** Verde contra rojo es justo el par que se
colapsa en un daltónico, y lo único que los sigue separando es la luminosidad:
por eso el rojo va abajo en la escala. Validado con el script de dataviz sobre
**todos** los pares —peor caso ΔE 11.0 en deuteranopía y 16.8 en visión
normal—, y además cada estado va rotulado, así que la identidad nunca depende
sólo del color. Antes de mover cualquiera de estos cuatro, volver a correr el
validador; no alcanza con que «se vean distintos».

En el isométrico cada estado son tres caras —tapa más clara, cara derecha con
el color de identidad, cara izquierda más oscura—, no tres colores nuevos.

**El verde queda reservado para la disponibilidad.** «+ agregar otro espacio»
es una acción, no un estado, así que va en tinta.

**Siete tamaños de letra y ninguno más:** 9.5 (versalitas), 11 (notas y ejes),
12 (secundario), 13 (cuerpo), 14.5 (títulos, campos y botón), 17 (códigos de
espacio) y 27 (el total del contrato). Antes había diecisiete, que es lo que
hace que una pantalla se vea armada de a pedazos. El contraste lo dan la
familia, el peso y el color, no el tamaño: en el plano el código y su fecha de
liberación miden lo mismo y se distinguen por peso. Nada baja de 9.4 px reales
—los rótulos del plano estaban a 8.1 y 8.8—; `generadores/tamanos.mjs` lista
los tamaños tal como se renderizan y sirve para no dejar entrar un octavo.

**El aire muerto se convirtió en contenido.** El panel de Contrato tenía 90 px
en blanco entre los sellos y el botón; bajó de 640 a 550 y esos 90 se los quedó
la tarifa de referencia, que pasó de mostrar 4 tipos de espacio a los 7, con su
pie que amarra la tabla con el gráfico: 15 libres, +5 entran, 20 al cerrar.

El SVG lo genera `docs/maquetas/generadores/riel.py`. La maqueta se verifica por
código y no a ojo: un script mide cada panel y marca lo que se recorta, otro
busca choques y desbordes entre los textos del SVG, y un tercero hace las dos
cosas sobre páginas de varios paneles. Vale la pena mantener esa costumbre
cuando esto baje al código.

### Supervisar

Está en `docs/maquetas/elegida-supervisar.html`, **con la misma estructura que
la pantalla desplegada**: la franja de cifras arriba, el isométrico a la
izquierda con lo accionable a su derecha, y **«Estado por espacio» a todo el
ancho debajo del plano**. La pantalla es larga y hace scroll, igual que hoy.

- **NAVE** — canon vigente, sin alquilar, lo que vence en 30 días, ocupación y
  sin montar. Cinco cifras, ninguna oración.
- **Piso de NAVE** — el isométrico. Acá **no es un directorio**: la tabla de
  abajo ya lista los 23 códigos, así que el plano ubica y se queda con **un solo
  rótulo, el de la fila abierta**. A ese ancho los 23 rótulos además caían a
  6,4 px reales.
- **Para revisar** — la lista de tareas: lo que vence y lo que se está cobrando
  sin estar armado, una línea por cosa, clickeable.
- **Quién paga el canon** — se calcula agrupando la misma tabla, así que no
  puede contradecirla.
- **Estado por espacio** — el libro entero: las 23 caras con estado, montaje,
  desde, hasta, días y renta.

Hay solapamiento deliberado entre «Para revisar» y la tabla: la primera es la
tarea, la segunda el registro. Es la estructura que el sistema ya tiene y que
funciona.

**Los ocho contratos de la tabla suman exactamente $5.300.001**, que es el canon
que muestra el sistema. Eso confirma que la tabla está completa y corrigió una
derivación mía: lo que vence en 30 días es **$3.700.000, el 70%** del canon, no
el 77% que había deducido suponiendo cinco contratos.

#### Tres cosas que la tabla deja ver y que valen un arreglo

- **«comercializadora nutresa» y «nutresa» son dos proveedores distintos** en la
  base. Casi seguro el mismo, cargado dos veces: aparece con 15% y 2% por
  separado en vez de 17% junto, y el ranking de concentración miente.
- **Un contrato de doce meses por `$1`** (PUN-09 en el sistema desplegado).
- **Una exhibición de piso a `$100.000`** cuando la tarifa de referencia del
  tipo es `$900.000`: un 89% por debajo.

Los tres los cazaría un aviso de «por debajo de tarifa», que es barato porque la
tarifa de referencia por tipo ya existe.

**Lo que se deja de percibir tiene una regla, y ya estaba escrita en el
código.** `frontend/src/utils/parte.ts` la resolvió con pruebas, y la maqueta la
respeta: **no se pinta una pérdida que todavía no ocurrió**. Con el periodo por
delante la cifra honesta no es «perdimos X», es la **tasa**: `$8.730.000` al mes
a tarifa de referencia por las 15 caras libres, o sea **`$281.613` por día
vacío**. Recién cuando hay días transcurridos aparece lo que *ya no se
recupera*, que es la cuenta que `colaDelPeriodo()` hace y que hoy la pantalla
desplegada calcula y no muestra en ninguna parte.

Va al lado del canon vigente a propósito: `$5.300.001` cobrando contra
`$8.730.000` parado dice solo lo que hay que decir, sin una oración que lo
explique. Las caras sin tarifa quedarían fuera de la cuenta y declaradas —la
regla también es de `parte.ts`—; en NAVE los siete tipos tienen tarifa, así que
no hace falta.

El dato que la pantalla desplegada entierra: **$4.100.001, el 77% del canon,
vence antes del 28 de sep**. Hoy eso vive como un «5» dentro de un casillero.
(El 77% es derivado: los cuatro proveedores del listado de vencimientos son
todos menos COCA COLA.)

### La paleta de producción, y lo que queda abierto

**La paleta del mapa: arreglada.** El par que se caía no era verde contra ámbar
—ése pasa— sino **libre `#4CC38A` contra no comercializable `#94A3B8`**: ΔE 8.0
en el peor caso daltónico y 14.7 en visión normal, los dos bajo el piso. Y no es
un detalle al margen: el gris es la mayor parte del plano, así que «lo que puedo
vender» contra «lo que ni siquiera se alquila» es justo el par que hay que
distinguir de un vistazo.

La salida **no** fue tocar el verde. Bajarlo lo acercaba al rojo, que bajo
deuteranopía es el vecino peligroso —probado: con el verde en `#1E9E6A` el par
verde-rojo cae a ΔE 6.5—. Se aclaró el gris a **`#DCE2E8`**, que separa por
luminosidad, que es lo que sobrevive cuando el tono se colapsa. Con eso los
cuatro colores del mapa pasan la separación en **todos** los pares: peor caso
ΔE 9.6 daltónico y 19.5 en visión normal. De paso hace lo correcto de diseño:
la infraestructura se va al fondo y el color queda para lo que se vende.

Es un solo valor, `NON_RENTABLE_TOP` en `DashboardView.tsx`, y las caras y el
contorno salen de ahí por `darken()`, así que el prisma sigue leyéndose en tres
dimensiones. El antes y después, con la simulación de deuteranopía al lado, está
en `docs/maquetas/paleta-plano.html`. **Antes de mover cualquiera de los cuatro
hay que volver a correr el validador**; que «se vean distintos» no es evidencia.

**Naranja para lo parcialmente ocupado.** El ámbar `#F0B429` tiraba a amarillo y
se leía como «atención», que es otra cosa. Pasa a naranja `#F08519`, y con eso el
mapa dice una escala en vez de tres etiquetas sueltas: **verde se puede vender,
naranja a medias, rojo no**.

El cambio tiene un costo que conviene tener escrito. Naranja y rojo son vecinos
de tono, así que el par más apretado de la paleta se mudó ahí:

| Par | Con ámbar | Con naranja | Piso |
|---|---|---|---|
| parcial ↔ tomado · daltónico | ΔE 21.8 | **ΔE 13.8** | ≥ 8 |
| parcial ↔ tomado · visión normal | ΔE 27.5 | **ΔE 16.7** | ≥ 15 |
| parcial ↔ libre · daltónico | ΔE 9.6 | ΔE 10.8 | ≥ 8 |

Sigue pasando —y contra el verde incluso mejora— pero el margen contra el rojo
baja bastante. Es un intercambio deliberado: se gana que la escala se entienda
sin leyenda, se pierde holgura en un par que igual va rotulado en las dos
pantallas. **No se puede oscurecer más el naranja**: probado, `#D4700F` cae a
ΔE 6.6 contra el rojo de producción.

El mismo naranja sirve para las dos paletas —la de producción, con el rojo
claro, y la de las maquetas, con el rojo oscuro—, así que es un solo valor en
todo el sistema.

**Lo que queda abierto en la otra escala.** El mapa tiene dos lecturas: la del
periodo (libre/parcial/tomado, la que se arregló) y la de «qué pasa hoy»
—`DISPLAY_TOP`— que tiene siete clases: libre, contratado, activo, por vencer,
vencido, reservado y mantenimiento. Ahí hay dos problemas que **no** se arreglan
moviendo un color:

- **`free #4CC38A` contra `maintenance #A8A29E` da ΔE 3.6 en deuteranopía.** Un
  daltónico no distingue «lo puedo vender» de «está en mantenimiento», que es
  justo lo contrario. Probé mover el gris de mantenimiento a oscuro y choca con
  el rojo en protanopía; a claro y choca con el gris nuevo.
- **`committed #A78BFA` contra `active #8B5CF6` da ΔE 11.9 en visión normal.**
  Ese par es deliberado —el mismo violeta, un paso más claro— y va rotulado, así
  que es defendible; queda anotado, no roto.

Siete clases es el techo que aguanta el color solo. La salida no es otro tono:
es bajar el número de clases o agregar una segunda codificación —una trama en
las caras en mantenimiento, por ejemplo—. Es una decisión de producto, no un
ajuste de paleta, y por eso no se tocó.

> **Cerrado al bajar las maquetas.** La decisión de producto la tomaron las
> maquetas, y no fue ninguna de las dos: fue sacarle el trabajo al color.
> **«Hoy» pasó a ser un periodo de un día** (`hoyComoRango()` en
> `SeasonPicker`), así que las dos pantallas tienen siempre periodo puesto y el
> plano pinta SIEMPRE la escala de tres —libre, se libera, tomado—. La lectura
> de siete clases ya no llega al plano: el detalle por estado vive **escrito**
> en «Estado por espacio», donde cada fila lleva su palabra al lado del punto.
> `DISPLAY_TOP` queda como respaldo, repintado sobre la paleta nueva y sin el
> violeta que arrastraba del sistema anterior.

**«El parte» ya no existe.** Ese bloque —el que reemplazaba la barra segmentada
y los seis casilleros por una o dos oraciones— nunca llegó a producción, y al
bajar las maquetas se lo reemplazó antes de llegar: en Supervisar por la franja
de cinco cifras y en Vender por la escalera y el panel de tarifas. La razón está
en la respuesta del usuario al verlo: *«veo mucho texto; el que pone el canon
sabe lo que hace, no hay que estar diciéndole qué precio poner»*. Su maquinaria
—`utils/parte.ts`, `utils/redaccion.ts`, `components/Parte/`— tampoco está: vive
en la historia de la rama de diseño.

**Hecho:** las dos pantallas están en código, y «Paleta y tipografía» arriba
describe el sistema vigente. La sección «La línea visual» que sigue más abajo es
**arqueología**: cuenta de dónde salieron IBM Plex y los neutros cálidos, que ya
no son los del sistema. Ante cualquier contradicción manda «Paleta y tipografía».

---

## Seguridad: lo que dejó el vibecoding

La auditoría salió de una pregunta concreta —esto se le va a vender a varios
supermercados, con contratos y planos adentro— y de lo que se lee afuera sobre
código generado con IA: la [Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
mide 62% de aplicaciones con al menos una vulnerabilidad seria, y
[Georgia Tech](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn)
encontró 86% de fallas de XSS en lo generado. Doce hallazgos, ordenados por lo
que costaría que pasen.

### Fase 1 — lo que no necesitaba que nadie decidiera

* **El IDOR de los archivos** (`routers/files.py`). Un `worker` autenticado
  podía listar y bajar **cualquier** adjunto por id: los contratos con las
  cifras del negocio incluidos. Ahora `list_space_files` **filtra** en vez de
  rechazar —así el panel del mercaderista sigue funcionando— y `download_file`
  contesta **404, no 403**: un 403 confirma que el archivo existe.
* **CVE-2024-53981** en `python-multipart` 0.0.9 → 0.0.20. Al parsear un
  multipart recorría byte a byte lo que viniera antes del primer delimitador y
  registraba cada uno; con `--workers 1` una sola petición tumba el servicio.
* **La cadena del `xlsx`** y las cabeceras de seguridad (CSP, `nosniff`,
  `frame-ancestors`, HSTS sólo bajo TLS) en `main.py`.

### Fase 2 — las contraseñas

Cuatro cosas, y las cuatro se probaron fallando contra el código anterior antes
de escribir el arreglo (`backend/tests/test_claves.py`, 19 pruebas).

**Estaban en texto plano.** `app_config` guardaba `admin_password` y
`worker_password` tal cual, y se comparaban con `==` —que además tarda distinto
según cuántos caracteres coincidan—. Un respaldo de la base las entregaba todas.
Ahora se guarda el hash **Argon2id** bajo una clave nueva.

> Se puede hacer **sin migración** porque `app_config` es clave/valor: una clave
> nueva es una fila nueva. `create_all` crea tablas que faltan pero nunca agrega
> columnas — la regla que sigue bloqueando el `tenant_id` de la fase 3.

**Migra sola.** En producción esas contraseñas están en claro desde hace meses.
Si el arreglo pidiera un paso manual, alguien se queda sin entrar el lunes:
`verificar_clave` acepta el texto heredado, escribe el hash y borra la fila en
claro **en el mismo movimiento**. Nadie hace nada, nadie queda afuera.

*Ahí aparecieron dos bugs que habrían tumbado el despliegue entero,* y los dos
son el mismo error de forma: una excepción que no era la que parecía.

1. `secrets.compare_digest` con cadenas **exige ASCII** y lanza `TypeError` con
   una tilde o una eñe. Una contraseña colombiana perfectamente normal
   —`señora-galerías`— no daba "clave incorrecta" sino un 500. Se compara en
   bytes.
2. `InvalidHashError` de Argon2 **no hereda de `Argon2Error`** sino de
   `ValueError`, así que el `except` obvio no lo atrapa. Un hash ilegible en la
   base —un respaldo a medias, alguien editando `app_config` a mano— convertía
   el login en un 500 para todo el mundo. Ahora es un 401 del rol afectado, con
   una línea de error en el log, y el otro rol sigue entrando.

**Las claves por defecto salieron del código.** `admin123` y `galerias` estaban
publicadas en el repositorio y eran las mismas para cada supermercado que
instalara esto. Una instalación nueva las toma de `ADMIN_PASSWORD` /
`WORKER_PASSWORD`, y si no están genera una al azar y la escribe en el log del
arranque. **La base manda:** si el rol ya tiene contraseña no se pisa aunque la
variable de entorno diga otra cosa, o cada reinicio revertiría lo que se cambió
desde la pantalla de configuración.

**El freno de intentos vivía en memoria** (`defaultdict` de `deque`). Se borraba
en cada despliegue, y Render reinicia el servicio gratuito cuando se queda
quieto: bastaba con esperar para tener los diez intentos otra vez. Ahora es una
tabla, `login_attempts`, y anota **sólo los fallos** —contar los aciertos
castigaba a quien entra y sale varias veces en la mañana, que es lo que hace un
administrador—. Un ingreso correcto borra la cuenta de esa IP.

**Y la IP tenía que ser la de verdad.** Detrás del proxy de Render todas las
peticiones llegan desde la misma dirección interna: el freno era decorativo. La
lista de `X-Forwarded-For` se lee **de derecha a izquierda** buscando la primera
pública, porque el principio de esa cabecera lo escribe el cliente y el final lo
escribe el proxy — leyéndola al derecho, cambiar la primera IP en cada intento
daba intentos infinitos. Si la conexión llega directa (el peer ya es público, no
hay proxy adelante) la cabecera se ignora entera.

**Cambiar la contraseña ahora echa a la gente.** Antes no: los JWT ya emitidos
valían hasta doce horas más, justo lo contrario de para qué se cambia una
contraseña. Cada rol lleva un contador de época en `app_config` y el token
guarda con cuál nació. Es **por rol** a propósito, y con una consecuencia de
pantalla: cuando el admin cambia su propia clave se cierra también su sesión, así
que la respuesta trae un token nuevo para no expulsarlo de la pantalla en la que
acaba de guardar.

**Los parámetros de Argon2 son los mínimos de OWASP** (19 MiB, dos pasadas, un
hilo), no los de la librería (64 MiB, cuatro hilos). El servicio corre en una
instancia de 512 MB: con los de fábrica, un puñado de intentos simultáneos
—exactamente lo que hace un ataque de fuerza bruta— se come la memoria de la
máquina. Defenderse de que adivinen la contraseña no puede costar el servidor.

### Fase 3 — lo que sí se podía hacer sin decidir nada

De la fase 3 quedaban dos hallazgos que no dependen de la decisión grande. Los
dos están hechos.

**El enlace de montaje salió de la barra de direcciones.** Viajaba como
`?t=<jwt>` y se quedaba ahí a propósito, para sobrevivir a una recarga; el costo
era que la credencial quedaba en el historial del navegador y en cualquier
captura de pantalla de la mercaderista. Ahora pasa a `sessionStorage` —que muere
al cerrar la pestaña, a diferencia del `localStorage` donde vive la sesión del
tablero— y la URL queda en `?montaje=1`.

Esa marca no es cosmética: sin ella, recargar y escribir la dirección pelada
serían indistinguibles, y el admin que abre el enlace en su computador quedaría
encerrado en la pantalla de montaje. Probado en navegador, con contrato real y
viewport de celular: llega, recarga, y `/` a secas vuelve al login.

*Lo que NO se tocó:* los 30 días de vigencia. Es una decisión de operación —el
correo sale al firmar y la exhibición se arma en los días siguientes—, no un
descuido. Y el `Referrer-Policy` de la fase 1 ya evita que el token se filtre por
la cabecera `referer`.

**La bitácora.** No había ninguna: si faltaba un contrato o cambiaba un valor,
no había forma de saber quién ni cuándo. Tabla nueva `audit_log` —otra vez, sin
migración—, con lectura sólo para el administrador en Configuración.

Se anota **lo que cambia algo o abre una puerta**: contratos creados y
cancelados, documentos subidos, bajados y borrados, sedes eliminadas, cambios de
contraseña, ingresos y ingresos fallidos. Los listados y las consultas no —si
cada pantalla dejara línea, lo que importa se pierde en el ruido—, y de los
archivos sólo se anota la bajada de **documentos**: la foto del montaje se abre
decenas de veces por día.

Tres decisiones que valen más de lo que parecen:

* **`anotar` no hace commit.** Viaja en la transacción del endpoint, así que la
  línea y el cambio caen juntos o no cae ninguno. Una bitácora que dice que se
  canceló un contrato que sigue vivo manda a buscar donde no hay nada.
* **Nunca entra un secreto.** Ni la contraseña que se intentó —media bitácora
  serían claves casi correctas de gente que se equivocó una letra—, ni el valor
  del contrato, ni el contenido del archivo. La bitácora la lee más gente que la
  base.
* **El título se arma al leer,** desde un código estable (`contrato.alta`). Si se
  guardara la frase, cambiar la redacción reescribiría el pasado.

Se purga a los 365 días, en el ciclo de mantenimiento que ya corría cada 12
horas: en una base de plan gratuito no puede crecer sin techo, y guardar de más
es su propio riesgo.

*Un bug encontrado al probarlo en pantalla:* SQLite guarda la fecha **sin huso**,
y el navegador lee eso como hora local. En Colombia son cinco horas: la bitácora
decía "recién" para algo de la madrugada. La hora sale marcada como UTC desde el
endpoint, que es donde se sabe qué es lo guardado.

### Lo que sigue pendiente, y por qué

* **Aislamiento entre supermercados (fase 3).** Es el hallazgo crítico que
  queda. `tenant_id` en las tablas que ya existen **necesita migraciones**, y la
  regla de este repo es que no hay. Hay que elegir: adoptar Alembic (base
  compartida con RLS) o una base por cliente. Es una decisión de producto, no
  técnica.
* **Cuentas de usuario.** La tabla `users` sí se puede crear sin migración, pero
  pasar de dos contraseñas compartidas a cuentas nominales es un cambio
  operativo para siete tiendas vivas: se coordina, no se despliega de sorpresa.
* **Pagos (fase 4).** Falta elegir proveedor —Stripe o MercadoPago para
  Colombia— y las llaves, que no viajan por chat: van en el panel de Render.
* **Dos avisos `moderate` de `react-router`** (open redirect). El arreglo es un
  salto de versión mayor; se dejó afuera a propósito de la fase 1.

Con eso, de los doce hallazgos quedan **dos**, y los dos son los que necesitan
una decisión: el aislamiento entre supermercados y las cuentas nominales. El
resto —el DoS, el IDOR, las contraseñas, las claves por defecto, el freno de
intentos, la revocación de sesiones, las cabeceras, el enlace en la URL y la
bitácora— está cerrado.

### Lo que hay que hacer a mano después de desplegar

**Cambiar la contraseña de administrador desde la pantalla de configuración.**
`admin123` está en el historial de git. La migración la mantiene funcionando
—por eso nadie queda afuera— pero mantenerla es dejar la puerta abierta.

---

## Un supermercado, una base

De los doce hallazgos de la auditoría quedaba el crítico: `sede` era un texto en
una tabla común, así que dos supermercados en esta base compartían tabla,
contraseña y archivos. Se eligió **una base de datos por cliente, todas dentro
de la misma instancia de Postgres.**

### Por qué ésa y no las otras dos

Se compararon tres. La [documentación de Render](https://render.com/docs/postgresql-creating-connecting)
dice que una instancia puede contener varias bases —`CREATE DATABASE`, y te
conectás con la misma URL cambiando el último componente—, y eso es lo que
rompió el empate:

| | Todo mezclado con `tenant_id` | **Una base por cliente** | Una instancia por cliente |
|---|---|---|---|
| Plata (5 clientes) | $44/mes | **$44/mes** | $120/mes |
| Trabajo | 2–3 semanas | **4–6 días** | 3–4 días + operación |
| Migraciones | Obligatorias (Alembic) | **Ninguna** | Ninguna |
| Aísla | Por política | **Por construcción** | Total |

**La razón que decidió es la tercera fila.** La regla de este repositorio es que
`create_all` crea tablas que faltan pero nunca agrega columnas. Meter
`tenant_id` en diez tablas con siete tiendas de datos vivos adentro pedía
adoptar Alembic; armar una base nueva y vacía no pide nada.

Y una cuarta, que no estaba en el análisis original: **esta opción deja abierta
la puerta a la de al lado.** Si mañana un cliente exige su propia instancia,
mudarlo es un `pg_dump` de su base. Sacarlo de una tabla compartida sería
extraer sus filas de diez tablas sin romper las llaves foráneas, con el sistema
andando.

### Lo que lo hizo barato

**Todos los routers pasan por `get_db`.** Ese es el único lugar donde se decide
contra qué base corre una consulta, así que separar clientes no obligó a tocar
los doce routers: se cambió el punto de entrada y de ahí en adelante nadie más
elige. Sólo tres lugares abrían sesión por fuera —el arranque, el ciclo de
mantenimiento y un ayudante de correo que resultó ser código muerto.

### El cliente va adentro del token

Sin esto la separación por base no serviría de nada. La firma de los JWT es
**una sola para todo el servicio**, así que un token de administrador de un
supermercado sería criptográficamente válido en el otro. Va adentro de lo
firmado (`create_token(role, epoca, cliente)`), y `cliente_del_pedido` verifica
la firma **antes** de mirar el nombre.

Un token sin cliente —los que ya estaban dando vueltas cuando se desplegó esto—
se resuelve con el único cliente que haya. Así nadie se queda afuera el día del
despliegue.

### Cómo entra la gente

`GET /api/auth/clientes` devuelve la lista, y el selector aparece en la pantalla
de ingreso **sólo cuando hay más de un cliente**. Para las siete tiendas que ya
usan esto, el día del despliegue no cambia nada.

El supermercado se manda explícito y **nunca se deduce de la contraseña**. Si se
dedujera, habría que probar la clave contra la base de cada cliente —lento a
propósito, porque el hash lo es— y, peor, si dos clientes eligieran la misma
contraseña entraría al que se revise primero.

Un cliente que no existe contesta **lo mismo que una contraseña equivocada**: si
dijera «ese supermercado no existe», la pantalla de ingreso serviría para
averiguar quiénes son los clientes.

### Detalles que cuestan caro si se pasan por alto

* **La lista de clientes vive en la base por defecto.** `create_all` crea la
  tabla `clientes` dentro de la base de cada cliente también, donde queda vacía
  y no significa nada. Por eso se lee siempre con `sesion_registro()` y nunca
  con la sesión del cliente que está pidiendo.
* **Un cliente nuevo arranca vacío.** El arranque siembra los pasillos de
  GALERIAS cuando la base está en cero; dárselos a otro supermercado sería peor
  que dejarlo vacío. La siembra quedó acotada al cliente por defecto.
* **Las conexiones se reparten.** Postgres Basic admite 100 en total, así que
  cada cliente abre un grupo chico (2 fijas, 3 de desborde) en vez de las 15 de
  fábrica de SQLAlchemy. Con eso entran unos quince supermercados antes de subir
  de instancia.
* **La URL se parsea, no se corta.** `?sslmode=require` es lo normal en un
  Postgres administrado. Cortando por la última barra, el nombre de la base se
  llevaría el parámetro puesto y la conexión del cliente nuevo saldría sin TLS.

### Cómo se da de alta un supermercado

```
cd backend
DATABASE_URL="<la de producción>" JWT_SECRET="<el del servicio>" \
  python ../scripts/alta_cliente.py olimpica "Olímpica"
```

Crea la base, sus tablas, la configuración y dos contraseñas al azar que
**imprime una sola vez**. No hay pantalla para esto a propósito: pediría inventar
un rol por encima del administrador —alguien que pueda tocar a TODOS los
supermercados—, que es justo la llave que no conviene que ande en un navegador.

### Si la base se muda de proveedor

El cliente por defecto es, **por definición**, la base a la que apunta
`DATABASE_URL`. Por eso el arranque corrige el nombre guardado cuando esa
variable cambia.

Sin eso, mudar la base rompía el sistema en la primera petición: la fila de
`clientes` seguiría diciendo el nombre viejo (`neondb`, por ejemplo), `motor_de`
no lo reconocería como el de siempre, y abriría un motor aparte contra una base
que en el destino no existe. Se encontró preparando justamente esa mudanza, y
está fijado en `test_si_la_base_se_muda_el_registro_la_sigue`.

### La copia de seguridad, con varios clientes

`scripts/respaldo.py` baja todo por HTTPS con la clave de admin — sin acceso al
servidor ni credenciales de la base. Con una base por cliente hubo que cambiarle
una cosa de fondo: **una sola clave no abre a todos**, porque cada supermercado
tiene la suya.

```
export RECABRA_CLAVE_GALERIAS='...'
export RECABRA_CLAVE_OLIMPICA='...'
python3 scripts/respaldo.py --base https://retail-espacios.onrender.com

# o uno solo, con RECABRA_CLAVE a secas
python3 scripts/respaldo.py --base https://... --cliente olimpica
```

Con un cliente solo alcanza `RECABRA_CLAVE`, que es como venía siendo: quien ya
lo tuviera programado no tiene que tocar nada.

**Cómo falla importa más que cómo funciona**, porque un respaldo se mira el día
que algo se rompió:

* Si falta la clave de un cliente, se copia el resto y **se dice cuál faltó**;
  la salida es 1, no 0.
* Si la copia quedó a medias, la carpeta se llama `...-INCOMPLETO`. El
  MANIFIESTO también lo dice, pero el nombre es lo que se ve cuando hay que
  restaurar apurado.
* Si no se copió ningún cliente, **no queda carpeta**. En una urgencia uno
  agarra la de fecha más nueva, y una carpeta vacía con la fecha de hoy es lo
  peor que puede encontrar ahí.
* Y sigue en pie la regla vieja: una copia sin ningún plano no sirve para
  volver, y lo avisa.

Se probó contra un servidor con dos clientes sembrados con datos distintos, y se
verificó que **la copia respeta el aislamiento**: la carpeta de cada uno tiene
sólo sus proveedores y sus sedes, sin rastro del otro.

### Cómo se probó

`backend/tests/test_clientes.py`, 17 pruebas. Para verificar que no son
decorativas se rompió el aislamiento a propósito —haciendo que
`cliente_del_pedido` ignore el token— y **siete pruebas fallaron**, incluidas
las cuatro que verifican que los datos no se cruzan.

La más exigente siembra un contrato de verdad en el primer cliente —proveedor,
marca, fechas, el mueble en el plano— y después pide lo mismo con el enlace de
montaje del segundo. Si la separación fallara, ahí saldría «Alpina».

Y en navegador, con dos clientes vivos: el selector aparece, cada uno entra al
suyo, y por API el primero tiene 41 espacios y el segundo 0.

---

## Gotchas

**La librería de Excel está vieja.** `xlsx@0.18.5` en npm arrastra vulnerabilidades
conocidas (prototype pollution, ReDoS) que sólo están corregidas en versiones que SheetJS
publica **fuera de npm**, en su propio CDN. Ya estaba en el proyecto para abrir adjuntos, y
la carga masiva le agrega una segunda entrada: siempre archivos que sube un admin
autenticado, nunca de terceros. Actualizarla implica cambiar el origen del paquete, así que
queda anotado y no hecho.


- `npm install` requiere `--legacy-peer-deps`.
- Las rutas de lista llevan barra final: `/api/spaces/`, `/api/layout/`.
- `JWT_SECRET` es una variable de entorno manual en Render, no viene del Blueprint.
- El login tiene rate limit: 10 intentos por IP cada 15 minutos, en memoria. Reiniciar el
  backend lo limpia (útil al automatizar pruebas).
- `/spaces/map`, `/dashboard/kpis` y `/dashboard/spaces` **existen pero no los llama
  nadie**: todo lo que se ve sale del JSON del layout, calculado en el navegador.
  `SpacePanel`, `StoreView` y `Legend` son componentes huérfanos. Antes de conectar esos
  endpoints hay que revisar que sus números coincidan con los del cliente.
- Quedan dos deudas que la revisión de fechas marcó como no urgentes: nada recalcula al
  **cruzar la medianoche** (una estación abierta todo el día queda anclada al día en que
  se montó la pantalla), y conviven **dos definiciones de "duración"** — el editor 3D y el
  correo de contrato nuevo cuentan exclusivo, así que un contrato del 1 al 24 de diciembre
  se anuncia como "23 días". Si se toca, hay que tocar los tres lugares juntos.
- `.github/workflows/deploy.yml` hace dos cosas distintas. En cada push y cada PR corre el
  **CI de verdad**: typecheck y build del frontend, `pytest` del backend. El **despliegue
  por SSH a un VPS** (no a Render) es opt-in: solo corre si la variable de repositorio
  `DEPLOY_TARGET` vale `vps`, junto con los secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY`.
  Sin eso se salta, no falla — que es lo que hacía desde junio y tenía los checks en rojo
  permanente.
- `npm ci` a secas falla acá: hay que usar `--legacy-peer-deps`, igual que el Dockerfile.
  `@react-three/drei@10` pide `fiber@^9` y el editor 3D está escrito contra `fiber@8`.
- `nginx/retail.conf` es para el despliegue en VPS, no para Render. Si ese VPS se reactiva,
  hay que copiar el archivo al host a mano — el workflow no lo despliega.
- **`flex: "1 1 480px"` no quiere decir «480 px de ancho».** El `flex-basis` va sobre el
  EJE PRINCIPAL del padre: en una fila es ancho, en una columna es alto. La tarjeta del
  plano se comparte entre Vender y Supervisar, y cuando pasó a vivir dentro de la columna
  de Vender ese mismo valor se volvió un alto de 480 px sobre un dibujo que pide 850 —
  con `overflow: hidden` en la tarjeta, el plano salió a producción cortado 142 px abajo.
  Ahora el `flex` lo pasa quien la llama.
- **De píxeles a coordenadas de un SVG se pasa con `getScreenCTM()`, no con una
  regla de tres.** `(clientX - caja.left) / caja.width * ANCHO` supone que el
  viewBox llena la caja, y no la llena: el `preserveAspectRatio` por omisión es
  `xMidYMid meet`, que encaja por el lado corto y **centra** lo que sobra. El
  cursor de «cuándo se libera» caía corrido hasta 131 px en 1920 y perfecto en
  1440, porque a 1440 la caja y el viewBox tienen casi la misma proporción y no
  hay franjas. Cualquier lectura al pasar el mouse sobre un SVG va por la matriz.
- **El harness revisa a 1440×900 y a 1920×1080.** Una sola pantalla no alcanza,
  y ése es el motivo: el encaje de un SVG depende de la proporción de su caja, y
  la caja depende de la ventana. El bug del cursor daba verde en 1440 y rojo en
  1920. El alto importa por lo mismo desde que el tope del plano se mide en
  `vh`. Son las dos configuraciones reales: el portátil y el monitor.
- **Un mueble tiene UN nombre, y desde la fase 13 es UN SOLO CAMPO.**
  `rotulosDelPlano()` decide dónde se dibuja —adentro de la caja si entra, y si
  no en la pastilla de arriba, nunca las dos—. El plano 2D dibujaba `item.code`
  a secas adentro mientras la pastilla mostraba el nombre puesto a mano: dos
  nombres para el mismo mueble, uno encima del otro. Hoy renombrar escribe el
  `code`, que es el nombre y la llave a la vez.
- **Y si DOS muebles de la sede se dibujan con el mismo nombre, los dos lo
  muestran y los dos salen marcados.** `nombresChocados()` cuenta los nombres
  repetidos del plano y `rotulosDelPlano()` recibe esa cuenta: el gemelo sin
  nombre puesto a mano —que por la regla de arriba no llevaba pastilla— pasa a
  llevarla, y la marca «×2» va en rojo pegada al rótulo (en el mapa isométrico
  de Vender, en una tercera línea con el código real: «×2 · IMP-12»). Sin esto,
  de las dos cajas rotuladas «IMP-08» el plano dibujaba una sola y quien elegía
  no tenía cómo sospechar que había otra: es la doble venta de la fase 12 vista
  desde la pantalla donde se elige. El aviso **no se apaga** con el botón
  «Etiquetas» —una etiqueta se oculta, un aviso no— y no bloquea nada: los dos
  muebles existen, son distintos y contratar los dos es legítimo.
- **Las filas de «Para revisar» abren la ficha.** Llamaban a `selectFixture` sin
  punto de anclaje, y con eso no salía ninguno de los dos paneles: el globito
  del mapa necesita un ancla y la ficha necesita `detailFull`, que sólo lo
  prendía el globito. La fila pintaba el mueble en el plano y ahí terminaba
  todo — justo el renglón desde el que se sale a renovar.

---

## Cómo probar de verdad

Los tres bugs peores aparecieron levantando la aplicación y mirándola, no leyendo el
código. Vale la pena el rato que toma:

1. Sembrar datos realistas en una base SQLite local.
2. Levantar backend (`:8000`) y Vite (`:5173`).
3. Conducir el navegador con Playwright y capturar. Chromium ya está instalado en
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

**Lo que es geometría pura, probarlo aparte.** `npm run probar` corre las seis suites
sin navegador (113 pruebas: planta, propuesta, nomenclatura, pasillos, revisión, acomodar): transpila el `.ts` con el esbuild que ya trae vite y
afirma en node. No hay runner de pruebas en el frontend y no valía la pena montar uno para
esto. Ahí se encontró que un paso largo saltaba por encima de un mueble.

**Después del 3D, los locators de Playwright dejan de resolver** aunque el DOM esté intacto:
el lienzo redibuja sin parar y el framework nunca lo considera estable. `page.evaluate` sigue
funcionando — despachar el clic sobre el nodo real ejecuta el mismo handler de React.

Para la sincronización, la prueba que importa es la de **dos clientes**: sembrar el
servidor, simular dos estaciones y verificar que las altas *y las bajas* viajan en ambos
sentidos, que un conflicto no pisa el trabajo del otro, y que una respuesta vacía del
servidor no borra la copia local.

**Sembrar siempre dos sedes con la misma nomenclatura.** `PUN-01` existe en NAVE y en
TERRON, y con una sola sede sembrada todo lo que confunde el código corto con el completo
pasa las pruebas. Así se encontró que el enlace del correo de montaje apuntaba a un código
que la pantalla nunca iba a encontrar.

Lo del mercaderista se prueba en **viewport de celular** (390×844) y con el enlace del
correo, no navegando a mano: entrar por `/?montar=SEDE-CODE` es el camino real, y ahí
aparecieron el `Content-Type` que rompía la foto y el doble montaje de StrictMode que se
comía el enlace.
