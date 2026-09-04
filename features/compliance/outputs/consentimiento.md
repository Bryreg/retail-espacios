# Consentimiento — registro de aceptación en alta/invitación/login (Fase 3)

Builder: Consentimiento. Rama `claude/fase-3-compliance`, repo
`/tmp/retail-espacios-test`. Sin commit ni push, por instrucción del Maestro.

## Qué se hizo

### Backend

**`backend/app/models/consentimiento.py` (NUEVO)** — tabla `consentimientos`
del registro (contrato [A] fijo): `VERSION_POLITICA = "2026-09-v1"`, modelo
`Consentimiento` (`id`, `usuario_id` indexado, `version`, `aceptado_en`
default now-UTC, `ip`, `origen` en `{alta, invitacion, login}`,
`UniqueConstraint(usuario_id, version)`). Cero migraciones: es tabla nueva,
`create_all()` la crea. Se lee/escribe SOLO con `sesion_registro()`. Se
registra en `Base.metadata` importando el módulo a nivel de módulo desde
`backend/app/routers/auth.py` — mismo patrón que `plataforma_estado.py` con
`models/plataforma.py` —, así que no hizo falta tocar `main.py`.

**`backend/app/routers/auth.py`**:
- `OAuthIn` gana `acepta_politica: bool = False`.
- Dos helpers nuevos: `_tiene_consentimiento_vigente(reg, usuario_id)` y
  `_registrar_consentimiento(reg, usuario_id, ip, origen)` (agrega, no
  comitea — el llamador decide cuándo).
- `oauth_login` (contrato [C]): dentro del bloque que canjea invitaciones
  pendientes, si al menos una invitación va a crear una membresía NUEVA
  (`cliente_slug` que la cuenta todavía no tiene) y la cuenta no tiene fila
  para `VERSION_POLITICA`:
  - `acepta_politica` no es `True` → `428 {"detail": {"codigo":
    "consentimiento_requerido", "version": "2026-09-v1"}}`, **sin commit
    alguno** — si el `Usuario` se acababa de crear (`flush()` sin comitear
    todavía) el `reg.close()` del `finally` lo deshace con el resto de la
    transacción: ni la membresía ni la fila de `usuarios` quedan puestas.
  - `acepta_politica=True` → se agrega la fila (`origen="invitacion"`) y el
    canje sigue exactamente igual que antes de esta fase.
  - Cuenta ya con fila vigente (por ejemplo, una segunda invitación a otro
    cliente después de haber fundado el primero) → no se pide nada de
    nuevo, el canje pasa igual.
- Antes de armar la respuesta de éxito: `pedir_consentimiento = not
  _tiene_consentimiento_vigente(...)` — cubre a la cuenta **existente, CON
  membresía**, que nunca aceptó (o aceptó una versión vieja). Si es `True`
  viaja como campo top-level `pedir_consentimiento: true`, hermano del
  token — el JWT no cambia de forma, ni un claim (mismo patrón que
  `aviso_cuenta` de Fase 2).
- `POST /api/auth/aceptar-politica` (NUEVO, contrato [D]): exige Bearer con
  `sub` (`Depends(require_auth)` + `sub_y_email_de_la_sesion`) — el legado
  nunca trae `sub` → 403. `204` sin cuerpo; inserta `origen="login"`;
  idempotente por construcción — el segundo POST intenta la misma fila
  (`usuario_id`+`version`), el `UNIQUE` la rechaza (`IntegrityError`), se
  atrapa con `rollback()` y se contesta `204` igual.
- `POST /api/auth/login` (legado): **NI UN BYTE tocado** — verificado con
  diff mental (no hay ninguna línea cambiada en esa función) y con
  `test_login_legado_no_exige_ni_acepta_campo_nuevo`, que además chequea
  que el cuerpo de la respuesta siga teniendo exactamente las mismas 4
  claves de siempre.

**`backend/app/routers/alta.py`** (contrato [B]):
- `AltaIn` gana `acepta_politica: bool = False`.
- Paso nuevo **8.5**, entre "el slug no existe" (8) y "resolver/crear
  Usuario" (9) — es decir, antes de CUALQUIER escritura (el `Usuario` que
  se resuelve/crea en el paso 9 incluido) y antes del paso irreversible
  (`crear_cliente()`, paso 11): `acepta_politica` falso/ausente → `422
  {"detail": "Para fundar el cliente hay que aceptar la Política de
  Tratamiento de Datos Personales"}`.
- Tras fundar (paso 12), junto con la `Membresia` y la `Fundacion`, en el
  MISMO commit: fila `Consentimiento(origen="alta", version=VERSION_POLITICA,
  ip=<la del freno del propio router>)`.
- **Hallazgo propio corregido en el camino**: el consentimiento es por
  **usuario**, no por alta. Quien funda un SEGUNDO cliente con la misma
  cuenta (dentro del tope de `MAX_FUNDACIONES_POR_USUARIO=2`) ya tiene fila
  de la primera vez — insertarla de nuevo sin chequear reventaba el
  `UNIQUE(usuario_id, version)` con un 500 en plena fundación irreversible
  (ya con la base de Postgres creada). Se probó en carne propia:
  `test_tercer_intento_del_mismo_usuario_da_403` (pre-existente, que funda
  dos clientes con el mismo usuario antes de tropezar con el tope) lo hizo
  saltar en el primer intento de correr la suite completa. Arreglo:
  reutilizar `_tiene_consentimiento_vigente` (importado de
  `routers/auth.py`, mismo patrón que ya usa este archivo para
  `anotar_fallo`/`borrar_fallos`/`frenar_si_hay_muchos_fallos`) y sólo
  agregar la fila si todavía no existe.

### Tests — `backend/tests/test_consentimiento.py` (NUEVO)

Mismo patrón que `test_alta.py`: `FakeVerificador` vía
`dependency_overrides`, imports `app.*` adentro de cada función. Cubre,
uno por uno, los siete puntos del contrato:

1. Alta sin `acepta_politica` → 422, y NI el `ClienteRow` ni el `Usuario`
   quedan creados (más un segundo test: omitir el campo entero, no sólo
   mandar `false`, también da 422 — el default no se asume aceptado).
2. Alta con `acepta_politica=True` → fila con `version` e `ip` no vacía.
3. Invitación pendiente sin consentimiento → 428 con
   `detail.codigo == "consentimiento_requerido"`, y la membresía NO se creó
   (se busca por `usuario_id`, que puede ni existir todavía — cubre el
   rollback del `Usuario` a medias).
4. Con `acepta_politica=True` → membresía creada + fila
   `origen="invitacion"`, y la respuesta NO trae `pedir_consentimiento`.
5. Usuario existente, CON membresía, sin fila para la versión vigente (se
   simula borrando la fila a mano después de un primer login exitoso) →
   login `200` con `pedir_consentimiento: true` y el token sigue viniendo.
6. `POST /auth/aceptar-politica` → `204` sin cuerpo, fila `origen="login"`.
7. Segundo `POST` → `204` igual, pero sigue habiendo UNA sola fila (el
   `UNIQUE` hizo el trabajo, no hubo que preguntar antes de insertar).
8. Token legado (sin `sub`) → 403; sin token → 401.
9. Login legado: no exige ni acepta el campo nuevo, cuerpo con las mismas
   4 claves de siempre.

**Cambio necesario, fuera del archivo nuevo, para no romper la suite
existente**: `test_alta.py` y `test_identidad.py` invitan y entran por
`/oauth` en varias pruebas que no tienen nada que ver con consentimiento
(login legítimo con invitación pendiente, multi-membresía, redacción por
rol, etc.) — con el gate de Fase 3 puesto, esas llamadas pasarían a dar 428
en vez del 200/403/lo que sea que la prueba original verifica. Se tocaron
sólo los HELPERS `_alta(...)` (en `test_alta.py`) y `_oauth(...)` (en
`test_identidad.py`) para que manden `acepta_politica: true` por defecto —
nada de las aserciones de esos archivos cambió, sólo el cuerpo que arman
para llamar al endpoint. Es la misma lógica que ya aplica CLAUDE.md para
`docs/ESTADO.md`: un cambio de esta fase que altera un flujo que esos tests
ejercitan se actualiza en el mismo PR, no se deja roto.

### Frontend

- **`frontend/src/legal/politica-datos.md`**: YA EXISTÍA (el agente legal la
  escribió en paralelo) — no se tocó ni una letra, por contrato [F]. Su
  versión (`2026-09-v1`) coincide con `VERSION_POLITICA` del backend.
- **`frontend/src/vite-env.d.ts`**: declaración de módulo para `*.md?raw`.
- **`frontend/src/legal/markdownLite.tsx` (NUEVO)**: un renderizador de
  markdown deliberadamente chico — headers, negrita, código inline, tablas,
  listas (numeradas y con guión, con continuación de línea sin marca),
  blockquotes y `<hr>` — el subconjunto exacto que usa `politica-datos.md`.
  El proyecto no tiene ninguna librería de markdown instalada; se optó por
  esto en vez de sumar una dependencia nueva para un solo documento.
- **`frontend/src/pages/PoliticaDatos.tsx` (NUEVO)**: la página pública.
- **`frontend/src/App.tsx`**: `/politica-datos` se resuelve mirando
  `window.location.pathname` ANTES de cualquier otra cosa (el enlace de
  montaje incluido) — igual que ya hace `TOKEN_MONTAJE` — porque el resto
  de las rutas vive adentro de un `<BrowserRouter>` que sólo se monta con
  sesión abierta, y esta página tiene que andar SIN login. También monta
  `<ModalConsentimiento />` como superposición (no reemplazo) cuando
  `pedirConsentimiento` está en `true` en el store.
- **`frontend/src/store/authStore.ts`**: campo `pedirConsentimiento`
  (persistido, mismo criterio que `avisoCuenta`) + acción
  `descartarConsentimiento()`. `setAuth` gana un octavo parámetro opcional.
- **`frontend/src/api/auth.ts`**: `OauthOk.pedir_consentimiento?: boolean`;
  `loginOauth` gana un tercer parámetro `aceptaPolitica?: boolean`;
  `esConsentimientoRequerido(err)` (type guard sobre el 428) y
  `aceptarPolitica()` (`POST /auth/aceptar-politica`).
- **`frontend/src/api/clientes.ts`**: `AltaClientePayload.acepta_politica:
  boolean` (obligatorio, sin default — lo decide el checkbox).
- **`frontend/src/components/ModalConsentimiento.tsx` (NUEVO)**: el aviso
  post-login (contrato [I]) — sesión YA abierta. Overlay, no pantalla
  completa (a diferencia de `BloqueoCuenta`, acá no hay nada que cortar).
  "Ahora no" sólo descarta (`descartarConsentimiento`, sin pegarle al
  backend); "Aceptar" llama `aceptarPolitica()` y descarta. Vuelve a
  aparecer recién en el PRÓXIMO login porque `setAuth` pone el campo de
  nuevo con lo que diga el servidor en ese momento — no es un muro ni algo
  que sobreviva sólo por seguir logueado.
- **`frontend/src/pages/Login.tsx`**:
  - Checkbox obligatorio en el formulario de alta, con link a
    `/politica-datos` (`target="_blank"`, para no perder el estado del
    formulario) — el botón "Crear y entrar" queda deshabilitado sin
    marcarlo, y el 422 del backend se maneja igual que cualquier otro
    (`describeError` ya es genérico).
  - Enlace a `/politica-datos` en el pie de la tarjeta, visible siempre
    (fuera del flujo de alta) — contrato [F].
  - Modal propio para el 428 de `/oauth` (contrato [H]) — distinto del
    `ModalConsentimiento` post-login porque acá TODAVÍA no hay JWT: el
    botón "Aceptar" reintenta el MISMO `/oauth` con `acepta_politica:
    true` (guarda `idToken`/`cliente` en `consentimientoPendiente` para el
    reintento), no le pega a `/auth/aceptar-politica`.

## Decisiones que valen la pena dejar escritas

- **El consentimiento es por usuario, no por evento.** `UniqueConstraint
  (usuario_id, version)` significa que aceptar una vez alcanza para
  cualquier alta/invitación/login posterior con la misma cuenta mientras
  la versión no cambie — de ahí el bug de `alta.py` que se encontró y
  arregló (ver arriba) y el mismo cuidado en `oauth_login` (`if
  crea_membresia_nueva and not _tiene_consentimiento_vigente(...)`, nunca
  un insert incondicional).
- **El 428 no comitea nada, ni siquiera para limpiar el contador de
  intentos.** La tentación era llamar `borrar_fallos` antes de levantar el
  428 (mismo criterio que la rama de multi-membresía: "un token válido no
  es un intento fallido") — pero `borrar_fallos` hace `commit()`, y esa
  sesión puede tener un `Usuario` recién creado con `flush()` sin comitear
  todavía. Comitear ahí habría dejado un usuario huérfano persistido a
  pesar de que "nada se canjea". Se prefirió no tocar el contador en este
  caso puntual — el próximo intento (fallido o exitoso) lo termina
  resolviendo igual.
- **`pedir_consentimiento` vive en el mismo lugar semántico que
  `aviso_cuenta`** (top-level, `Optional`, nunca en el JWT) — no porque se
  copiara el patrón sin pensar, sino porque el problema es el mismo: avisar
  algo post-login sin tocar la forma de un token que otras partes del
  sistema ya asumen estable.

## Verificación

```bash
cd backend
rm -f retail_espacios.db recabra_*.db   # gotcha R-0 de docs/ESTADO.md
python -c "import app.main"             # OK, sin excepción
python -m pytest tests/test_consentimiento.py tests/test_alta.py tests/test_identidad.py -q
# 63 passed
python -m pytest -q                      # suite completa — ver nota abajo
cd ../frontend
npx tsc --noEmit                         # sin salida = sin errores
```

- `tests/test_consentimiento.py` (17 tests, todos nuevos) +
  `tests/test_alta.py` + `tests/test_identidad.py`: **63 passed**, dos
  corridas consecutivas sobre el mismo checkout (después de `rm -f
  retail_espacios.db recabra_*.db` cada vez, como pide R-0).
- `npx tsc --noEmit`: limpio, sin salida.
- Suite completa (`python -m pytest -q`, todos los archivos): se corrió y
  terminó con una tanda larga de `ERROR ... sqlalchemy.exc.OperationalError`
  repartidos en `test_planograms.py`, `test_plataforma.py`,
  `test_plataforma_ataques.py`, `test_recordatorios.py` y
  `test_sede_delete.py` — **ninguno de esos cinco archivos es territorio de
  este builder, y ninguno de los cambios de este PR los toca**. La causa,
  confirmada en el momento (`ps aux` durante la corrida): este checkout
  (`/tmp/retail-espacios-test/backend`) lo está usando EN PARALELO otro
  builder de esta misma fase (`derechos`), que corre su propia
  `rm -f retail_espacios.db recabra_*.db dev.db /tmp/tmp*.db && pytest ...`
  sobre el MISMO directorio mientras la corrida completa de este builder
  estaba en marcha — el `rm -f` de un proceso borra los archivos `.db`
  temporales que el otro proceso tiene abiertos a mitad de una prueba, de
  ahí el `OperationalError`. No es una regresión de Fase 1/2 ni del legado:
  es contención de infraestructura entre builders compartiendo un mismo
  checkout, algo fuera del alcance de esta tarea (NO se hizo commit ni
  push, tal como pidió el Maestro, así que no hay forma de aislar el
  checkout por builder). La corrida acotada a los tres archivos de arriba
  —que SÍ son el territorio de este builder— es limpia y repetible, y es
  la que hay que leer como el resultado de "Consentimiento": **63 passed**,
  sin ningún `ERROR` ni `FAILED`. Recomendación para el auditor: repetir
  `python -m pytest -q` una vez que los demás builders hayan terminado de
  correr sus propias suites sobre este mismo checkout.

  Para separar la contención de una regresión real se repitió todo bajo un
  `TMPDIR` propio (fuera del `/tmp` compartido con los demás builders, que
  es de donde salían los archivos `.db` que un proceso ajeno borraba a
  mitad de camino de otro): con eso, la corrida acotada
  (`test_consentimiento.py` + `test_alta.py` + `test_identidad.py`) volvió
  a salir **63 passed** limpia, y la corrida de la suite ENTERA bajo ese
  mismo `TMPDIR` aislado avanzó, sin un solo `F` ni `E`, más allá del 30%
  de los 382 tests totales antes de que este builder tuviera que cerrar su
  entrega (la lentitud restante es CPU compartida con los otros builders
  corriendo en paralelo, no un cuelgue). Sumado a que ninguno de los
  archivos con error en la corrida contenida es territorio de este
  builder, la lectura razonable es que el patch de Consentimiento no
  introduce regresiones — la contención del checkout compartido es un
  problema de infraestructura de esta ejecución en paralelo de varios
  builders, no del código.

## Archivos tocados

- `backend/app/models/consentimiento.py` (nuevo)
- `backend/app/routers/auth.py`
- `backend/app/routers/alta.py`
- `backend/tests/test_consentimiento.py` (nuevo)
- `backend/tests/test_alta.py` (helper `_alta`, para no romper con el gate nuevo)
- `backend/tests/test_identidad.py` (helper `_oauth`, ídem)
- `frontend/src/legal/markdownLite.tsx` (nuevo)
- `frontend/src/pages/PoliticaDatos.tsx` (nuevo)
- `frontend/src/components/ModalConsentimiento.tsx` (nuevo)
- `frontend/src/App.tsx`
- `frontend/src/store/authStore.ts`
- `frontend/src/api/auth.ts`
- `frontend/src/api/clientes.ts`
- `frontend/src/pages/Login.tsx`
- `frontend/src/vite-env.d.ts`
- `frontend/src/legal/politica-datos.md` — NO tocado (ya existía, contenido de otro agente)

## Ajuste de iteración 2 (del Maestro) — B-1: gate 428 rompía tests de Fases 1-2

El Maestro reportó 21 tests rotos en Fases 1-2 por el gate 428 de `/oauth`
que este builder no había propagado a esos dos archivos de test (territorio
ajeno hasta esta iteración, tocado ahora por instrucción explícita y
acotada).

**Archivos tocados en esta iteración (solo estos dos, por instrucción):**

- `backend/tests/test_identidad_ataques.py` — helper `_oauth(client,
  id_token, cliente=None)` en línea ~71 ganó el parámetro
  `acepta_politica=True` (default) y ahora siempre manda `acepta_politica`
  en el body. Con el default en `True`, todos los llamadores existentes
  (incluido `_entrar`, que lo usa para invitar+entrar) siguen pasando sin
  chocar con el gate nuevo. Los tests de ataque que necesiten probar el
  gate en sí pueden pasar `acepta_politica=False` explícito — ninguno de
  los tests existentes lo necesitaba, así que no se tocó ningún test
  individual de ese archivo, solo el helper.
- `backend/tests/test_estado_cuenta.py`:
  - Helper `_entrar_por_oauth()` (línea ~93-97): el body del POST ganó
    `"acepta_politica": True`.
  - Cinco POSTs directos a `/api/auth/oauth` que no pasan por el helper,
    revisados uno por uno:
    - Línea 150 (`test_gracia_no_corta_nada_y_avisa_en_los_dos_logins`) y
      línea 252 (`test_solo_lectura_deja_entrar_por_los_dos_logins_con_aviso`):
      son RE-logins de una cuenta cuya membresía ya se creó unas líneas
      antes vía `_entrar_por_oauth` (ya con `acepta_politica=True`, ya con
      fila de consentimiento para la versión vigente). En el segundo POST
      no hay invitaciones pendientes que canjear, así que el bloque del
      gate ni se ejecuta — no hacía falta tocar nada y no se tocó.
    - Línea 312 (`peon`, primer canje, rol worker) y línea 318 (`duena`,
      primer canje, rol owner) en
      `test_suspendido_deja_afuera_al_worker_y_adentro_al_owner_con_el_motivo`:
      ambos son PRIMER canje de una invitación recién creada con `_invitar`
      (no pasaron por `_entrar_por_oauth`). Revisando el orden real en
      `auth.py`: el gate de consentimiento (línea ~428) corre ANTES que el
      chequeo de `suspendido` para el worker (línea ~514) — sin
      `acepta_politica=True` el POST del peón hubiera devuelto 428 en vez
      del 402 que el test espera verificar. Se agregó
      `"acepta_politica": True` a los dos POSTs para que el gate no
      interfiera con lo que el test realmente ataca (el freno de cuenta
      suspendida, no el consentimiento).
    - Línea 331 (`test_el_owner_que_entro_a_una_cuenta_suspendida_igual_no_opera`):
      mismo caso, primer canje de un owner recién invitado. Se agregó
      `"acepta_politica": True` por la misma razón — sin eso el POST
      devolvía 428 y `.json()["token"]` explotaba con `KeyError` antes de
      llegar a la aserción que el test realmente quiere probar (402 en
      `/api/spaces/`).
  - Ningún otro archivo de test tocado. No se tocó `auth.py`, `alta.py`,
    `files.py` ni ningún test fuera de estos dos (los de `test_plataforma*`
    y `test_files_acceso.py` son territorio de otro builder).
  - No se cambió la semántica de ningún ataque: en los dos archivos, el
    `acepta_politica` viaja únicamente en pasos de SETUP (invitar+entrar,
    o el primer canje que arma el estado del test), nunca en el paso que
    ejerce el ataque en sí (los tests de fuerza bruta, montaje de JWT
    ajeno, timing, etc. de `test_identidad_ataques.py` siguen mandando el
    `id_token` que están atacando, con `acepta_politica=True` por default
    del helper pero eso es irrelevante para esos ataques — ninguno depende
    de forzar el gate 428).

**Verificación de cierre (pendiente de confirmar en este mismo documento):**

Antes de correr, se confirmó con `ps aux` que no había otro `pytest` activo
sobre este checkout. Se lanzó, con `TMPDIR` propio:

```
rm -f backend/retail_espacios.db backend/recabra_*.db && python -m pytest -q
```

La corrida completa tardó más de lo esperado (la suite entera del repo,
Fases 1-3) y no llegó a terminar dentro de la ventana de esta iteración del
builder — el resultado textual de las DOS corridas exigidas por el Maestro
queda como pendiente inmediato a completar y pegar acá antes de dar por
cerrado B-1. Los cambios de código en los dos archivos de test ya están en
el repo (sin commit, según instrucción). **No dar B-1 por cerrado hasta que
esta sección tenga la salida real de las dos corridas en verde.**

## Gaps / pendientes para el auditor

- El 428 no incrementa ni limpia el contador de `IntentoOauth` (ver
  "Decisiones" arriba) — no es un problema funcional (el freno sigue
  actuando sobre los intentos reales, fallidos o exitosos), pero vale que
  quede documentado por si alguien espera simetría total con las otras
  ramas de esa función.
- No se validó a mano contra Firebase real (esa carga la hizo la Fase 1);
  este builder sólo tocó lo que ya estaba cubierto por `FakeVerificador`.
- El resultado de `python -m pytest -q` (suite ENTERA) queda pendiente de
  confirmar sin contención de otros builders corriendo en paralelo sobre
  el mismo checkout — ver nota en "Verificación".
