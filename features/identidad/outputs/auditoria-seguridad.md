# Auditoría ofensiva de tokens — Fase 1 Identidad

**Rol:** auditor-tokens (red team de autenticación) · **Rama:** `claude/fase-1-identidad`
**Repo:** `/tmp/retail-espacios-test` · Sin commit ni push.

## Alcance y método

Se atacó la segunda cadena de confianza que introduce esta fase — Firebase →
ID token → JWT propio — y todo lo que cuelga de ella: verificación del ID
token, confusión de tokens, invitaciones, cross-cliente, revocación,
enumeración y fugas.

Cada hallazgo tiene reproducción ejecutable. Los ataques viven en **un único
archivo nuevo**, `backend/tests/test_identidad_ataques.py` (22 tests). Ningún
archivo de producción ni ningún test existente fue modificado.

```
cd backend && python -m pytest tests/test_identidad_ataques.py -q
20 passed, 2 xfailed
```

Los dos `xfail(strict=True)` son los **hallazgos abiertos**: afirman el
comportamiento seguro, que hoy no se cumple. Con `strict=True`, el día que se
arreglen pasan a XPASS y ponen la suite en rojo — el recordatorio de sacarles
el marcador. Mientras tanto la suite queda verde y el hallazgo no se pierde.

> **Nota para correr la suite completa.** Con `TMPDIR` por defecto la suite es
> no determinista por un problema de aislamiento del harness, no del producto
> (ver observación 7). Con un `TMPDIR` propio —`TMPDIR=$(mktemp -d) python -m
> pytest tests/ -q`— la suite completa da **283 tests, cero fallos**.

### Estado del código auditado

El builder de backend **estuvo iterando durante esta auditoría**. Los
hallazgos H-1 … H-6 y H-9 se encontraron contra versiones anteriores y ya
están tapados; quedaron acá con su reproducción convertida en test de
regresión, porque son el registro de qué se rompió y por qué no puede volver.
El veredicto corresponde a este estado exacto:

| archivo | md5 |
|---|---|
| `backend/app/auth.py` | `66a531dced0ad39505b0a7022d227a75` |
| `backend/app/routers/auth.py` | `84acc9ac5feb3d9626307474337044c3` |
| `backend/app/routers/usuarios.py` | `0e111d0ab638ee936a22515251a9ca38` |
| `backend/app/services/firebase_tokens.py` | `56a1cf407e10936fb8a6e24405edf5ef` |
| `backend/app/models/identidad.py` | `7a2d95d9f5babf9c6a9d5920977d434b` |

---

## Hallazgos ABIERTOS

### H-7 · El token de la invitación no se verifica nunca — **media**

**Qué pasa.** `POST /api/usuarios/invitar` genera un token opaco de 256 bits
(`backend/app/routers/usuarios.py:105`), lo guarda en `invitaciones.token` y
lo manda por correo dentro del enlace
(`backend/app/routers/usuarios.py:122`, `…/login?invitacion=<token>`). **Ese
token no se lee en ningún lado.** `grep` sobre todo el backend y el frontend:

* backend — la columna sólo se escribe; no hay un solo `filter(Invitacion.token == …)`;
* frontend — `Login.tsx` nunca mira `?invitacion=`, y `OAuthIn`
  (`backend/app/routers/auth.py`) no tiene campo donde recibirlo.

El canje en `/api/auth/oauth` se resuelve por **igualdad de `email` y nada
más** (`backend/app/routers/auth.py:291-300`).

**Por qué importa.** El contrato de API dice «token firmado con JWT_SECRET» y
el docstring de `Invitacion` (`backend/app/models/identidad.py`) dice que el
token vuelve la invitación «irreproducible». Las dos cosas son falsas hoy: la
única prueba que se exige es controlar ese correo en Firebase. Es un segundo
factor que se pagó (columna, correo, enlace) y no se cobra — y es justo lo que
haría falta para cerrar H-8.

**Reproducción.** `test_ataque_el_token_de_la_invitacion_no_se_verifica_nunca`
— invita, lee el token emitido de la tabla, entra por `/oauth` **sin
presentarlo**: 200.

**Arreglo propuesto (builder backend + frontend).**
`OAuthIn` gana `invitacion: Optional[str]`; el frontend lee `?invitacion=` de
la URL y lo reenvía en el POST. En `/oauth`, canjear una invitación exige que
el token coincida (`Invitacion.token == payload.invitacion`) **y** que el
email coincida. Si el contrato prefiere no tocar el front en esta fase,
entonces hay que corregir el contrato y el docstring: decir que la invitación
se resuelve por correo verificado y borrar la columna `token` y el enlace, en
vez de sostener una garantía que no existe.

---

### H-8 · Un cliente ajeno se agrega una membresía sin consentimiento — **media**

**Qué pasa.** El bloque de invitaciones de `/oauth`
(`backend/app/routers/auth.py:291-336`) se ejecuta en **todos** los logins y
filtra sólo por `Invitacion.email == email` — sin `cliente_slug`, sin
consentimiento, sin paso de aceptación. Es la corrección de H-3/H-4 (canjear
todas las pendientes, no sólo la más nueva) llevada un paso más allá de lo
necesario.

**El ataque.** El admin de cualquier cliente del servicio escribe un correo
conocido en `POST /api/usuarios/invitar`. En el **próximo login de esa
persona en cualquier otro cliente**, nace sola una membresía activa en el
cliente del atacante. A partir de ahí, `GET /api/usuarios` del atacante
muestra el `email`, el `nombre` real y el `ultimo_login` de esa persona, y su
`PATCH` puede prenderle y apagarle esa membresía. La víctima se entera porque
de golpe la pantalla de ingreso le pregunta a qué supermercado quiere entrar.

Hoy el alta de clientes es manual, así que el atacante tiene que ser un admin
ya dentro del sistema; con el alta self-service de la Fase 2 esto queda
abierto a cualquiera que se registre.

**Reproducción.**
`test_ataque_un_cliente_ajeno_se_agrega_una_membresia_sin_consentimiento`
— la persona entra a `galerias`; un admin de `ajeno` la invita; la persona
vuelve a entrar y ya es miembro de `ajeno`; `GET /api/usuarios` de `ajeno` la
lista con nombre y último login.

**Arreglo propuesto (builder backend).** El canje deja de ser implícito:

* con H-7 arreglado, sólo se canjea **la invitación cuyo token vino en el
  pedido** — el resto queda pendiente; o
* si el canje implícito se conserva para el primer alta (usuario nuevo, que es
  el caso literal de la spec), limitarlo a ese caso: cuando el usuario **ya
  existe**, no crear membresía nueva sin un acto explícito (endpoint
  `POST /api/usuarios/aceptar-invitacion` con el token del correo).

En cualquiera de las dos, `GET /api/usuarios` no puede exponer `nombre` ni
`ultimo_login` de alguien que no aceptó entrar a ese cliente.

---

## Hallazgos CERRADOS durante la auditoría (regresiones en el archivo de ataques)

Se encontraron contra versiones anteriores del código y ya están tapados. Cada
uno quedó como test que **pasa**: si la defensa se afloja, la suite avisa.

### H-1 · El token de rescate de `PUT /api/auth/passwords` esquivaba la revocación — era **bloqueante**

`update_passwords` reemitía el token con `create_token(rol, epoca, cliente)`,
**sin `sub`**. Como `decode_token` sólo somete al chequeo de membresía a los
tokens que traen `sub` (`backend/app/auth.py:449-457`), cualquier admin u owner
con cuenta real se fabricaba —con un solo pedido legítimo— una credencial de
12 horas inmune a que lo desactivaran. La revocación individual, que es la
razón de ser de la fase, quedaba salteada desde su propio panel de
configuración.

*Cerrado:* `sub_y_email_de_la_sesion` (`backend/app/auth.py:410`) recupera el
`sub`/`email` del pedido y `update_passwords` los conserva en el token
reemitido. Regresión: `test_h1_el_token_de_rescate_de_passwords_conserva_sub`
— además comprueba que la desactivación mata a los dos tokens.

### H-2 · Una invitación se canjeaba con un correo sin verificar — era **alta**

El filtro era `claims.proveedor == "password" and not claims.email_verificado`:
sólo el proveedor de correo/contraseña tenía que probar el correo. Cualquier
otro proveedor del proyecto Firebase (o un ID token sin
`firebase.sign_in_provider`) podía declarar el correo de otra persona y
quedarse con su invitación —y con el rol `owner` que esa invitación reservaba.

*Cerrado:* `backend/app/routers/auth.py:258` invierte el filtro —
`claims.proveedor != "google.com" and not claims.email_verificado` — de modo
que **todo** proveedor tiene que traer `email_verified`, con Google como única
excepción justificada (verifica el correo antes de emitir el token, aunque no
siempre marque el claim). Regresión: `test_h2_…` recorre `password`,
`facebook.com`, `custom` y `None`, más el caso Google que sí debe entrar.

### H-3 · Una invitación a un segundo cliente no se canjeaba nunca — era **media**

El bloque de invitaciones vivía dentro del `if usuario is None`. Quien ya
tenía cuenta jamás canjeaba una invitación nueva: entraba al cliente viejo y
la invitación quedaba pendiente para siempre, visible en `GET /api/usuarios` y
sin forma de usarla. «Invitar un worker por correo» —el checklist de la spec—
fallaba para cualquiera que ya usara el sistema en otro supermercado.

*Cerrado:* el bloque salió del `if`. Regresión: `test_h3_…`.

### H-4 · Dos invitaciones al mismo correo se pisaban — era **media**

`order_by(creado_en.desc()).first()` canjeaba **una sola** invitación, la más
nueva. Con H-3, la otra quedaba huérfana para siempre: un segundo cliente que
invitara el mismo correo se llevaba el alta puesta.

*Cerrado:* `backend/app/routers/auth.py:291-336` canjea **todas** las
pendientes en orden ascendente, con `ya_miembro` cuidando el
`UNIQUE(usuario_id, cliente_slug)`. Regresión: `test_h4_…`, que comprueba que
cada membresía nace con el rol de SU invitación.

### H-5 · Un token con `sub` de un usuario borrado seguía valiendo — era **baja (latente)**

`_membresia_activa` miraba sólo la fila de `membresias`. Con la fila de
`usuarios` borrada y la membresía atrás, el token seguía abriendo todo. Hoy no
hay endpoint que borre usuarios; lo habría con la Fase 2.

*Cerrado:* `backend/app/auth.py:367` agrega el `join` contra `usuarios`.
Regresión: `test_h5_…`.

### H-6 · `/oauth` no tenía freno de intentos — era **media**

`POST /api/auth/login` corta a los 10 fallos por IP; `/oauth` no cortaba
nunca: verificación RSA gratis e ilimitada, y un oráculo sin costo.

*Cerrado:* `backend/app/routers/auth.py:243` aplica el mismo freno.
Regresión: `test_h6_…`.

### H-9 · El freno de `/oauth` contaminaba el login legado del cliente por defecto — era **baja**

La primera versión del freno de H-6 contaba contra `LoginAttempt` usando
`sesion_registro()`. Esa no es una base neutra: es la base del cliente por
defecto (ver el docstring de `backend/app/clientes.py`). Resultado: los fallos
de `/oauth` de **todos** los clientes se sumaban al freno del login legado de
`galerias` —12 ID tokens inventados dejaban al admin de `galerias` con 429 en
`POST /api/auth/login` sin haber fallado una contraseña—, y al revés; y cada
pedido de identidad de un cliente escribía y borraba filas en la base de otro.
No permitía bloquear a terceros (`backend/app/red.py` resuelve bien la IP real
detrás del proxy, así que un atacante sólo se bloquea a sí mismo), pero cruzaba
la línea que la separación por base existe para no cruzar.

*Cerrado:* tabla nueva `IntentoOauth` en `backend/app/models/identidad.py`, en
el registro, y `frenar_si_hay_muchos_fallos`/`anotar_fallo`/`borrar_fallos`
parametrizados por modelo (`backend/app/routers/auth.py:48`, `72`, `77`). Sin
migración: es una tabla nueva. Regresión:
`test_h9_el_freno_de_oauth_no_contamina_el_login_legado`, que comprueba las
dos direcciones.

---

## Ataques ejecutados que NO encontraron nada

Todos con reproducción en el mismo archivo; van listados porque «se probó y
aguantó» es parte del entregable.

| Ataque | Resultado | Dónde |
|---|---|---|
| `alg: none` en el ID token | rechazado en el header, antes de tocar el JWKS | `firebase_tokens.py:158` |
| HS256 firmado con el material público del JWKS (key confusion) | rechazado dos veces: header + `algorithms=["RS256"]` | `firebase_tokens.py:158`, `179-185` |
| `RS384` y otros RSA | rechazados | ídem |
| `aud` de otro proyecto | rechazado (`audience=project_id`) | `firebase_tokens.py:183` |
| `iss` ajeno | rechazado | `firebase_tokens.py:184` |
| `exp` vencido | rechazado | `jwt.decode` |
| **ID token VÁLIDO de otro proyecto Firebase** | rechazado. El JWKS de `securetoken` es COMPARTIDO por todos los proyectos —la firma verifica— y lo único que separa es `aud`+`iss`. Los dos se validan por parámetro, no a mano después | `firebase_tokens.py:183-184` |
| `kid` inventado / URL de JWKS controlada por el token | imposible: la URL es constante y la clave sale del JWKS por `kid`; un `kid` ausente fuerza **un** refresco, nunca un bucle | `firebase_tokens.py:47`, `160-170` |
| JWKS caído o con formato raro | falla cerrado (devuelve lo cacheado o vacío → 401), no abierto | `firebase_tokens.py:120-144` |
| JWT propio (HS256) presentado como ID token en `/oauth` | rechazado | `test_el_jwt_propio_no_sirve_como_id_token_en_oauth` |
| ID token de Firebase (RS256) con `role`/`epoca`/`cliente` inyectados, presentado en `require_auth`, `/api/usuarios`, `?token=` de archivos y de montaje | 401 en los cuatro | `test_un_id_token_de_firebase_no_entra_por_require_auth` |
| Token de montaje en `/oauth`, en `require_auth` y en `/api/usuarios/invitar` | 401 en los tres | `test_el_token_de_montaje_no_abre_oauth_…` |
| Revocación por los caminos laterales: `?token=` de `/api/catalogo/{id}/imagen`, `/api/files/{id}` y `/api/montaje/mi-espacio` | los tres pasan a 401 con la membresía apagada — todos caen en `decode_token` | `test_la_revocacion_alcanza_el_token_por_query_…` |
| Épocas: el token legado sigue muriendo al cambiar la clave del rol | intacto | suite existente |
| `cliente` arbitrario en el body de `/oauth`: membresía **inactiva**, mayúsculas, espacios, `../`, `%00` | 403 en todos | `test_el_body_cliente_de_oauth_no_alcanza_una_membresia_inactiva` |
| `PATCH /api/usuarios/{id}` de un admin de A sobre un miembro de B | 404, y la membresía real queda intacta | `test_un_admin_de_a_no_toca_las_membresias_de_b` |
| `GET /api/usuarios` desde otro cliente | lista vacía | ídem |
| Confusión de base: cabecera de A + `?token=` de B en el mismo pedido | manda la cabecera; `_credencial` y `_leer_credencial` la prefieren igual que `require_auth`, así que no hay desacuerdo entre «quién sos» y «qué base» | `test_la_cabecera_manda_sobre_el_token_de_query` |
| Escalada de rol: invitado como worker que intenta nacer admin (vía `nombre`, vía `cliente`, vía el body) | el rol sale de la membresía; 403 en `/api/usuarios` y en `/invitar` | `test_el_rol_del_token_lo_manda_la_membresia_no_el_pedido` |
| Reactivación por la puerta de atrás: invitación nueva sobre una membresía desactivada | 409 en el endpoint; y forzando la fila a mano, el canje **no** resucita la membresía ni le sube el rol | `test_una_invitacion_no_resucita_ni_asciende_una_membresia_apagada` |
| Enumeración en `/invitar`: ¿el 409 delata que el correo existe en el sistema? | no: sólo habla del cliente propio; invitar a alguien conocido y a un desconocido responden igual | `test_invitar_no_delata_…` |
| Enumeración en `/oauth`: ¿se distingue «invitación vencida» de «nunca invitado»? | mismo 403, mismo `detail` | `test_oauth_no_distingue_…` |
| Fugas: ID token, JWT propio o `JWT_SECRET` en respuestas de error o en la bitácora | ninguno aparece | `test_ni_el_id_token_ni_el_jwt_propio_se_filtran` |
| Invitación vencida / ya usada | no sirven | suite existente (`test_identidad.py`) |

---

## Observaciones que no son hallazgos

1. **`google.com` se salta `email_verified` por decisión explícita.** Es
   correcto —Google verifica el correo antes de emitir el ID token y no
   siempre marca el claim— pero es una excepción por *nombre de proveedor*: si
   mañana el proyecto Firebase habilita un OIDC genérico que se identifique
   como `google.com`, la excepción viaja con él. Vale dejarlo escrito donde se
   configuran los proveedores, no sólo en el comentario del código.

2. **Un `admin` puede invitar `owner` y desactivar owners.** `ROLES_MEMBRESIA`
   admite los tres y el guardián del «último owner activo»
   (`backend/app/routers/usuarios.py:202-217`) es lo único que los distingue.
   Como el JWT mapea `owner → admin` y no hay ninguna capacidad exclusiva del
   owner, ese guardián es decorativo: un admin invita un segundo owner y
   después desactiva al original. Es coherente con la spec (decisión 5) y no
   cambia nada hoy; se vuelve un problema en cuanto el owner tenga facturación.

3. **No hay forma de cambiar el rol de una membresía.** `PATCH` sólo mueve
   `activo`. Alguien invitado como worker por error se arregla desactivando y
   volviendo a invitar… que da 409 mientras la membresía exista. Es un agujero
   de operación, no de seguridad.

4. **Las épocas de los tokens de `/oauth` siguen atadas al login legado.** Un
   token de cuenta real nace con la época del rol compartido, así que cambiar
   la clave compartida de worker cierra la sesión de todos los workers con
   cuenta propia. Y al revés: cuando un cliente apague el login legado
   (decisión 4 de la spec), nada volverá a subir esa época y la revocación
   masiva quedará sin palanca — sólo quedará la individual, de a uno.

5. **`FIREBASE_PROJECT_ID` no está en `render.yaml`.** El despliegue arranca
   bien y `/oauth` responde 503, que es la degradación pedida — pero significa
   que en producción la vía nueva nace apagada hasta que alguien la cargue a
   mano en el dashboard. Conviene dejar la variable declarada con
   `sync: false`, como ya se hace con las de correo.

6. **`Usuario.nombre` sale del claim `name` del ID token sin acotar.** Se
   guarda y se devuelve en `/oauth` y en `GET /api/usuarios`. React escapa, así
   que no es XSS; es almacenamiento sin límite de largo controlado por quien se
   registra.

7. **Aislamiento de la suite en SQLite (para auditor-compat).**
   `clientes.url_para()` mapea cada cliente a una ruta FIJA hermana del archivo
   de la prueba (`<tmp>/recabra_<slug>.db`,
   `backend/app/clientes.py:79-84`). Con `TMPDIR` por defecto eso es
   `/tmp/recabra_vecino.db` para **todas** las corridas de la máquina: dos
   `pytest` simultáneos —o un agente corriendo la suite mientras otro la
   corre— se pisan el archivo y el segundo revienta con `attempt to write a
   readonly database` dentro de `crear_cliente`. Es lo que hacía fallar
   `test_identidad.py::test_token_de_un_cliente_no_abre_la_base_de_otro` sólo
   en la corrida completa, de forma intermitente. No afecta producción (allá es
   Postgres, con un nombre de base por cliente), pero vuelve la suite no
   determinista. Con `TMPDIR` propio la suite completa da **283 tests, cero
   fallos**. Arreglo sugerido: que el sufijo del archivo SQLite derive del
   nombre del archivo de la base por defecto (`recabra_<slug>_<tmpname>.db`) en
   vez de sólo del slug.

8. **Carrera en el alta por invitación (hipótesis, no reproducida).** Dos
   `POST /api/auth/oauth` simultáneos del mismo usuario nuevo entran los dos
   por la rama `usuario is None`: no hay bloqueo ni `ON CONFLICT`, y el
   `usada_en` de la invitación se escribe recién en el `commit` final. En
   SQLite el archivo serializa las escrituras y no se pudo forzar; en Postgres
   el `UNIQUE` de `usuarios.firebase_uid`/`email` y el de
   `(usuario_id, cliente_slug)` deberían hacer fallar al segundo con un 500 en
   vez de duplicar — feo, no inseguro. Vale confirmarlo contra Postgres antes
   de darlo por cerrado.


---

## Veredicto

**APTO para producción**, con los dos hallazgos abiertos como deuda a cerrar
antes de la Fase 2 —no antes de desplegar la Fase 1—.

**Bloqueantes: ninguno.** El único bloqueante que apareció en toda la
auditoría fue **H-1** (el token de rescate sin `sub`, que anulaba la
revocación individual) y está cerrado, con regresión.

La cadena de confianza aguanta lo que tenía que aguantar: el ID token se
verifica contra el JWKS de Google con RS256 exclusivo, `aud`, `iss` y `exp`
por parámetro y sin ninguna URL de JWKS influible desde el token; los dos
tipos de token no se confunden en ninguna dirección; el claim `cliente`
firmado sigue siendo lo único que elige la base; y la revocación por membresía
alcanza **todos** los caminos, incluidos el `?token=` de los iframes y la
puerta de montaje.

Lo que queda abierto no rompe el aislamiento entre supermercados ni deja entrar
a un desconocido:

* **H-7 (media)** — el token de la invitación es decorativo: la invitación se
  gana con el correo, no con el enlace. Cerrarlo es lo que hace falta para
  cerrar bien H-8, y además alinea el código con lo que ya prometen el
  contrato de API y el docstring del modelo.
* **H-8 (media)** — un admin de otro cliente se anexa una membresía ajena sin
  consentimiento y ve nombre y último login de esa persona. Hoy el atacante
  tiene que ser un admin del sistema; **con el alta self-service de la Fase 2
  pasa a ser un problema de cualquiera**, así que no puede cruzar esa fase
  abierto.

**Orden sugerido para el orquestador:** H-8 y H-7 juntos —son el mismo
arreglo: canje explícito y ligado al token del correo— al builder de backend,
con el reenvío de `?invitacion=` al builder de frontend. Ninguno de los dos
frena el despliegue de la Fase 1.
