# Red Team Fase 2 — Frontera de operador y superficie de denegación

Auditor ofensivo · rama `claude/fase-2-clientes` · contrato:
`features/clientes/outputs/equipo-fase-2.md` · spec: `features/clientes/spec.md`

**Entregables**

| Qué | Dónde |
|---|---|
| Los ataques, ejecutables | `backend/tests/test_plataforma_ataques.py` (30 tests: 25 pasan, 5 `xfail(strict=True)`) |
| Este informe | `features/clientes/outputs/red-team-privilegio.md` |

```
cd backend && TMPDIR=<un directorio escribible> python -m pytest tests/test_plataforma_ataques.py -q -rx
```

> **Dos cosas antes de correr la suite** — las dos se descubrieron atacando y
> las dos le van a costar tiempo al auditor de regresión si no las lee primero.
> La segunda es un hallazgo (R-0, abajo), la primera es sólo este entorno.
>
> 1. **`/tmp` acá es de sólo escritura a medias.** SQLite puede crear el archivo
>    pero no escribirlo ("attempt to write a readonly database"), y `conftest.py`
>    pone la base ahí con `tempfile.mkstemp`. Con `/tmp` por defecto fallan
>    cuatro tests que no tienen nada de malo —los cuatro que fundan un cliente
>    nuevo—; con `TMPDIR` apuntado a un directorio normal, verde. Artefacto del
>    entorno, no del código.
> 2. **La suite completa está verde una sola vez** (R-0): la primera corrida
>    deja `backend/retail_espacios.db` con el cliente `nuevomarket` adentro y la
>    segunda arranca en rojo. Antes de medir regresión: `rm -f
>    backend/retail_espacios.db backend/recabra_*.db`.

---

## 0. R-0 · bloqueante para el plan de verificación de cierre (no es una vulnerabilidad)

**La suite completa sólo está verde la primera vez que se corre.**

**Dónde**: `backend/tests/test_correo_api.py:17` (`from app.services import
mailer`, el ÚNICO `import app.*` a nivel de módulo de todo `tests/`) +
`backend/app/database.py:7` (`os.getenv("DATABASE_URL", "sqlite:///./retail_espacios.db")`).

**La cadena**:

1. Pytest **importa** todos los módulos de test en la colección, antes de correr
   nada. `test_correo_api.py` trae `app.services.mailer` → `app.auth` →
   `app.database`, que construye el motor **en el import** con la
   `DATABASE_URL` del ambiente — que todavía nadie fijó.
2. El motor queda clavado en `sqlite:///./retail_espacios.db`, un archivo del
   directorio `backend/` que **sobrevive a la corrida**.
3. El fixture `client` del PRIMER test fija `os.environ["DATABASE_URL"]` y hace
   `import app.database`, que ya está en `sys.modules`: no tiene efecto. (La
   purga de `sys.modules` de `conftest.py:52-54` corre en el *teardown*, así que
   protege al segundo test en adelante y no al primero.)
4. Desde la Fase 2, el primer test alfabético del repo es
   `tests/test_alta.py::test_alta_feliz_funda_owner_y_base_vacia`, que **funda un
   cliente**. Corrida 1: pasa, y deja `nuevomarket` grabado en
   `backend/retail_espacios.db` más el archivo `backend/recabra_nuevomarket.db`.
   Corrida 2 en adelante: **409, rojo**.

**Comprobado**, no deducido — en el `backend/` de esta rama, ahora mismo:

```
$ python -c "import sqlite3; print(sqlite3.connect('backend/retail_espacios.db')
              .execute('select slug,nombre,db_name from clientes').fetchall())"
[('galerias', 'Galerías', 'retail_espacios'),
 ('nuevomarket', 'Nuevo Market', 'recabra_nuevomarket')]
```

Esos dos archivos los dejó la corrida del builder, no la mía.

**Por qué importa acá y no antes.** El defecto de la colección es viejo (Fase 0);
lo que cambió es que el primer test del repo pasó a ser uno que **escribe estado
persistente**. Antes el primer test era inofensivo contra un motor viejo. El
plan de cierre del contrato dice «suite COMPLETA verde»: si el auditor corre
`pytest` dos veces —o si CI corre sobre un checkout que ya corrió— va a ver rojo
y va a buscar el bug en el interruptor de estado, que no tiene nada que ver.

**Reproducción, ejecutada** (dos veces el mismo comando, sin tocar nada en el
medio; hacen falta los dos archivos para que la cadena se arme: `test_alta.py`
aporta el primer test que escribe, `test_correo_api.py` el import de colección):

```
$ rm -f backend/retail_espacios.db backend/recabra_*.db
$ cd backend && python -m pytest tests/test_alta.py tests/test_correo_api.py
22 passed
$ ls retail_espacios.db recabra_*.db
recabra_nuevomarket.db   retail_espacios.db      ← quedaron en el árbol de trabajo

$ python -m pytest tests/test_alta.py tests/test_correo_api.py
F.....................                                            [100%]
E   assert 409 == 200
FAILED tests/test_alta.py::test_alta_feliz_funda_owner_y_base_vacia
```

(Los dos `.db` sueltos que había en `backend/` cuando llegué —los dejó la
corrida del builder— los borré para que la próxima corrida de la suite arranque
limpia. Son artefactos ignorados por git, no fuente.)

**Sugerencia** (territorio del builder / del auditor de regresión, no mío): mover
el `from app.services import mailer` de `test_correo_api.py` adentro de sus
funciones, como hace TODO el resto de `tests/`. Es una línea y cierra la cadena
entera. Como cinturón, `conftest.py` puede purgar `sys.modules['app.*']` también
al ENTRAR al fixture y no sólo al salir.

---

## 1. Qué se atacó y con qué criterio

Tres superficies estrena la Fase 2 y las tres se atacaron por separado:

1. **La frontera de operador de plataforma.** Es un privilegio nuevo definido
   por una cadena de texto en una variable de entorno, no por una tabla. Las
   fronteras definidas por texto se rompen en el matcheo (mayúsculas, espacios,
   prefijos), en el caso vacío (env sin definir, correo vacío) y en la
   credencial que no debería calificar (el login legado, que no tiene `sub` ni
   `email`).
2. **La superficie de denegación** (`solo_lectura`, `suspendido`). Una semántica
   de denegación no se rompe en el endpoint que el builder probó: se rompe en el
   router que nadie enumeró, en el verbo raro, en el camino lateral que no lleva
   cabecera (`?token=` en la query, el enlace de la mercaderista) y en el cache.
3. **El alta self-service como superficie de abuso.** Es el primer endpoint del
   sistema que un desconocido puede llamar y que termina en un `CREATE DATABASE`.

**Disciplina.** Cada ataque es un test. Los que el sistema resiste pasan y
quedan como red de seguridad. Los que el sistema cede quedan escritos afirmando
el comportamiento SEGURO y marcados `xfail(strict=True)`: la suite sigue verde,
el hallazgo no se pierde, y el día que se tape el agujero el test se vuelve
XPASS y pone la suite en rojo para que alguien le saque el marcador. **No se
tocó una línea de `app/` ni de `frontend/`.**

---

## 2. Tabla de ataques ejecutados

Los identificadores `(a)…(t)` son los del catálogo de la misión; los `R-n` son
hallazgos de este informe.

### Frontera de operador

| # | Ataque | Resultado | Test |
|---|---|---|---|
| a | Token legado (contraseña compartida) contra `GET`/`PATCH /api/plataforma/*`, con su correo y un comodín en `OPERADOR_EMAILS` | **resistió** — 403 siempre, y el PATCH no escribió fila | `test_a_el_token_legado_jamas_es_operador_aunque_su_correo_este_en_la_env` |
| a′ | ¿Existe la credencial híbrida (`email` sin `sub`), que sería operadora e inmune a la revocación por membresía? | **resistió** — ni el login legado ni el token de rescate de `PUT /auth/passwords` la emiten | `test_a2_ningun_login_emite_un_token_con_email_pero_sin_sub` |
| b | Cuenta con `sub` cuyo correo NO está en la env | **resistió** — `soy:false`, 403 en GET y PATCH | `test_b_una_cuenta_con_sub_fuera_de_la_env_no_es_operadora` |
| c | `OPERADOR_EMAILS` ausente, `""`, `" "`, `","`, `" , , "`, `",,,"`; y correo vacío / de espacios | **resistió** — nadie es operador en ningún caso | `test_c_sin_operador_emails_no_hay_operadores` |
| d | `" Admin@X.CO "` en la env vs `"admin@x.co"` en el token; y matcheo parcial (`a@x.co` contra `aa@x.co`, prefijos, sufijos, infijos) | **resistió** — normaliza espacios y mayúsculas, nunca matchea parcial | `test_d_el_match_normaliza_espacios_y_mayusculas_pero_nunca_es_parcial` |
| e | Escalada horizontal: ¿el panel trae datos de negocio? ¿ser operador abre `/api/spaces` o `/api/dashboard` de un cliente ajeno (incluso forzando `?cliente=` o `?token=`)? | **resistió** — el panel devuelve exactamente las 7 claves del registro, y el token del operador sigue siendo el de SU cliente | `test_e_el_operador_no_ve_ni_toca_datos_de_negocio_de_nadie` |
| f | PATCH con slug inexistente y hostil, estado inventado, motivo vacío (para los cuatro estados) | **resistió** — 404 / 422 / 422, y ninguna fila escrita | `test_f_el_patch_del_operador_rechaza_slug_estado_y_motivo_invalidos` |
| f′ | PATCH con estado no canónico (`"SUSPENDIDO"`, `" suspendido "`): ¿puede quedar guardado un valor que el interruptor no reconoce y por lo tanto deja pasar? | **resistió** — el PATCH normaliza antes de validar y lo guardado corta de verdad | `test_f2_un_estado_no_canonico_nunca_queda_guardado_a_medias` |
| g | Operador con su propio cliente suspendido: ¿sigue operando la plataforma? ¿sigue operando su negocio? | **resistió** — plataforma sí (exención del contrato), negocio no (402 en 9 lecturas y en la mutación), y puede destrabarse a sí mismo | `test_g_un_operador_con_su_propio_cliente_suspendido_sigue_operando_la_plataforma` |

### Superficie de denegación

| # | Ataque | Resultado | Test |
|---|---|---|---|
| h | `solo_lectura`: **27 mutaciones** — spaces, suppliers, leases, layout (settings/seasons/rates/sede), bulk confirmar y validar, mounts, catálogo, files, planometrías, notificaciones, montaje | **resistió** — 402 con el detail exacto en las 27; las 9 lecturas siguen en 200 | `test_h_solo_lectura_corta_una_muestra_ancha_de_mutaciones` |
| i | `suspendido`: GET también; foto/planometría por `?token=` (el camino de `_credencial` sin cabecera); enlace de montaje (token de mercaderista) | **resistió** — 402 en las 9 lecturas, en los 4 `?token=` y en los 3 del montaje | `test_i_suspendido_corta_los_caminos_laterales_que_no_llevan_cabecera` |
| j | Bypass por método: HEAD y OPTIONS contra las 27 mutaciones; ¿algún GET que escriba por el parámetro? | **resistió** — 405 en las 54 combinaciones, cero cambios en la base; el único GET que escribe por dentro es `expire_leases()` y sigue funcionando | `test_j_ni_head_ni_options_abren_una_mutacion_en_solo_lectura` |
| k | 402 de `suspendido` en `/oauth` por rol, y a quién le llega el motivo | **resistió** — worker y admin 402 sin motivo, owner 200 con motivo, y el owner que entró igual no opera | `test_k_suspendido_en_oauth_deja_afuera_a_la_gente_y_adentro_al_owner` |
| l | Carrera de cache: tras PATCH a suspendido el pedido siguiente ya debe cortar; tras PATCH a activo debe volver a entrar | **resistió** — en los dos sentidos, movido por el PATCH real y no por la siembra | `test_l_el_interruptor_se_siente_en_el_pedido_siguiente_en_los_dos_sentidos` |
| m | Fila ausente y fila `activo`: humo (login legado, GET spaces/map/kpis, POST supplier) idéntico | **resistió** — 201 en los dos casos, y el cuerpo del login sin `aviso_cuenta` | `test_m_sin_fila_y_con_fila_activo_la_suite_de_humo_pasa_igual` |
| — | Aislamiento: el estado de un cliente no se contagia al de al lado (ni por el cache) | **resistió** | `test_c3_el_estado_de_un_cliente_no_se_contagia_al_de_al_lado` |
| **R-1** | Pedido **sin credencial** contra un endpoint de negocio en una instalación de un cliente | **CEDIÓ** — contesta 402 en vez de 401: el estado de cuenta se lee sin autenticarse | `test_r1_un_pedido_anonimo_no_debe_delatar_el_estado_de_cuenta` |
| **R-2** | ¿Quién ve el `motivo` que escribió el operador? | **CEDIÓ** — en `gracia` y `solo_lectura` lo ve cualquiera, incluida la contraseña compartida de worker | `test_r2_el_motivo_de_la_deuda_no_deberia_llegarle_a_los_no_owner` |

### El alta como superficie de abuso

| # | Ataque | Resultado | Test |
|---|---|---|---|
| n | 45 slugs hostiles: `galerias`, reservados, mayúsculas, tildes y ancho completo, `"a"*40`, comillas, `DROP TABLE`, backtick + `CREATE DATABASE`, `../`, NUL, salto de línea, tabulador | **resistió** — todos 409/422, `crear_cliente` **nunca fue llamado** (se espió la función), cero bases en disco, cero filas | `test_n_ningun_slug_hostil_llega_al_create_database` |
| o | Duplicado contra un cliente **inactivo** (el caso que `buscar()` no ve y que habría reventado el UNIQUE en 500) | **resistió** — 409 con el mismo detail que cualquier duplicado; el alta consulta la tabla cruda | `test_o_un_cliente_inactivo_ocupa_el_slug_y_da_409_no_500` |
| p | Tercera fundación del mismo usuario | **resistió** (secuencial) — 403, sin base y sin fundación de más | `test_p_la_tercera_fundacion_del_mismo_usuario_muere` |
| **R-3** | Dos fundaciones **simultáneas** del mismo usuario | **CEDIÓ** — el tope es un `count()` sin barrera en la base; dos pedidos concurrentes dejan 3 | `test_r3_el_tope_de_dos_fundaciones_no_tiene_barrera_en_la_base` |
| q | 10 tokens basura → 429, y los fallos no deben ensuciar `oauth_attempts` ni `login_attempts` | **resistió** — 401×10 y 429 después; las otras dos tablas en cero y las otras dos puertas abiertas para la misma IP | `test_q_el_freno_del_alta_no_contamina_ni_al_login_legado_ni_a_oauth` |
| r | Correo no confiable (`password`, `facebook.com`, `custom`, sin proveedor, y correo vacío) | **resistió** — 401 y cero rastro: ni `Usuario`, ni `ClienteRow`, ni base en disco | `test_r_un_correo_no_confiable_no_crea_absolutamente_nada` |
| s | Usuario con 2 fundaciones y 0 membresías activas | **resistió** — 403 igual: el tope es por fundación, no por membresía | `test_s_el_tope_es_por_fundacion_y_no_por_membresia_activa` |
| t | "Sin cliente a medias": tras 401 / 422 / 409 reservado / 409 duplicado / 403 no queda `ClienteRow`, `Membresia` ni `Fundacion` | **resistió** | `test_t_ningun_4xx_del_alta_deja_un_cliente_a_medias` |
| **R-4** | Falla del paso irreversible (`crear_cliente`) después del `commit()` que suelta el candado | **CEDIÓ** — queda un `Usuario` huérfano grabado | `test_r4_un_alta_que_falla_en_el_paso_irreversible_no_deja_usuario_huerfano` |
| **R-5** | Alta contra un slug cuya **base ya existe** (equivalente SQLite del `already exists` que Postgres traga) | **CEDIÓ** — el alta adopta la base ajena y le crea las tablas adentro | `test_r5_el_alta_no_debe_adoptar_una_base_que_ya_existe` |

---

## 3. Hallazgos

### R-1 · mayor · El estado de cuenta se filtra sin credencial

**Dónde**: `backend/app/clientes.py:439` y `backend/app/clientes.py:444`
(`cliente_del_pedido` llama `_aplicar_estado` en los dos caminos, incluido el
fallback `unico()`), en combinación con `app/auth.py:511-514` (`get_db` es
sub-dependencia de `require_auth`, así que se resuelve **antes**).

**Qué pasa.** En una instalación de un solo cliente —la de producción hoy—
`cliente_del_pedido` resuelve el cliente por `unico()` aunque no venga
credencial ninguna, y `_aplicar_estado` levanta el 402 antes de que nadie mire
el token. Resultado: cualquiera en internet distingue con un `GET` anónimo si la
cuenta está sana (401 "No autenticado") o degradada (402 "La cuenta de este
cliente está suspendida." / "Cuenta en solo lectura por pago pendiente.").

**Por qué importa.** El propio código se cuidó de no construir ese oráculo en la
puerta de al lado: `routers/auth.py:221-225` explica que el 402 del login va
DESPUÉS de comprobar la contraseña justamente para que la pantalla de ingreso no
delate qué supermercados dejaron de pagar. El interruptor lo regala gratis en
cada endpoint de negocio. Es información comercial de un cliente (su mora)
expuesta a un desconocido, y encima el mensaje es explícito.

**Ataque que lo demuestra**:
`test_r1_un_pedido_anonimo_no_debe_delatar_el_estado_de_cuenta`.

**Sugerencia** (no aplicada — territorio del builder): que el 402 no salga sin
credencial. La forma barata es que `_aplicar_estado` sólo corra cuando el pedido
trajo una credencial (`_credencial(request) is not None`), dejando el camino
anónimo como estaba: el 401 lo pone igual `require_auth` un instante después, y
ningún endpoint queda más abierto que hoy.

---

### R-2 · mayor · El motivo de la deuda le llega a quien no es owner

**Dónde**: `backend/app/routers/auth.py:241` (`aviso_cuenta=aviso` en el login
legado) y `backend/app/routers/auth.py:479` (`cuerpo["aviso_cuenta"] =
aviso.model_dump()` en `/oauth`).

**Qué pasa.** `motivo` es texto libre que escribe el operador de plataforma —en
la práctica, número de factura, días de mora, con quién hay que hablar—. En
`suspendido` el contrato lo protege bien: el no-owner recibe 402 sin motivo, y
el propio código lo argumenta en `routers/auth.py:449-451` ("el motivo NO viaja:
es información de la relación comercial, y esa la tiene el owner, no su gente").
En `gracia` y `solo_lectura` esa regla no se aplica: el `aviso_cuenta` completo,
motivo incluido, sale para **todos** — para el miembro con rol `worker` y, peor,
para **la contraseña compartida de worker**, que no es una persona sino un
cartel en la trastienda que sabe cualquier mercaderista de turno.

**Por qué importa.** No es un secreto técnico: es la relación comercial del
supermercado con RECABRA. Que el estado ("estás en mora") viaje es el punto del
banner; que viaje el texto que el operador escribió para sus colegas, no.

**Ataque que lo demuestra**:
`test_r2_el_motivo_de_la_deuda_no_deberia_llegarle_a_los_no_owner` (cubre las
dos puertas: legado con clave de worker, y `/oauth` con membresía `worker`).

**Sugerencia**: aplicar en `gracia`/`solo_lectura` la misma regla que ya existe
para `suspendido` — mandar `{"estado": ...}` sin `motivo` salvo que el rol sea
`owner`. El banner del frontend puede decir "hay un pago pendiente, hablá con
quien administra la cuenta" sin el detalle.

---

### R-3 · menor · El tope de dos fundaciones no tiene barrera en la base

**Dónde**: `backend/app/routers/alta.py:139-144` (el `count()`) y
`backend/app/routers/alta.py:165` (el `INSERT`), con
`backend/app/models/plataforma.py:50-52` (`UniqueConstraint("usuario_id",
"cliente_slug")`).

**Qué pasa.** Entre el `count()` y el `INSERT` no hay nada que impida que dos
pedidos simultáneos del mismo usuario lean ambos "llevo 1 < 2" y funden los dos.
El UNIQUE existente impide fundar **dos veces el mismo slug**, que no es lo que
el tope quiere impedir.

**Por qué es menor.** El daño está acotado a un cliente de más por carrera
ganada, y hace falta disparar dos altas simultáneas con el mismo `id_token`.

**Ataque que lo demuestra**: `test_r3_el_tope_de_dos_fundaciones_no_tiene_barrera_en_la_base`
(dos sesiones de registro que leen antes de que la otra escriba, que es
exactamente lo que hacen dos workers de Uvicorn).

**Sugerencia**: nada de bloqueos — alcanza con hacer que la base sostenga la
regla, por ejemplo un `UniqueConstraint("usuario_id", "orden")` con el ordinal
de fundación, o un `SELECT … FOR UPDATE` sobre la fila de `usuarios` antes de
contar. Es tabla nueva: no necesita migración.

---

### R-4 · menor · Un alta que falla en el paso irreversible deja un `Usuario` huérfano

**Dónde**: `backend/app/routers/alta.py:152` (`reg.commit()` antes de
`crear_cliente`, para soltar el candado de SQLite).

**Qué pasa.** El commit que suelta el candado también graba el `Usuario` recién
creado. Si `crear_cliente` falla justo después (permiso de Postgres, disco,
carrera de slug), la respuesta es 409 y queda una fila de `usuarios` sin
membresía, sin fundación y sin cliente.

**Por qué es menor.** Esa fila no abre nada: `/oauth` le contesta 403 ("tu
cuenta no tiene acceso a ningún cliente"). Es deuda de consistencia —contradice
la promesa de "sin cliente a medias" del contrato— y fondo de tabla que crece
con cada intento fallido. Los tres artefactos que el contrato enumera
(`ClienteRow`, `Membresia`, `Fundacion`) sí quedan limpios: eso está verificado
y pasa (`test_t_…`).

**Ataque que lo demuestra**:
`test_r4_un_alta_que_falla_en_el_paso_irreversible_no_deja_usuario_huerfano`.

**Sugerencia**: crear el `Usuario` **después** de `crear_cliente`, en el mismo
commit que la membresía y la fundación (paso 12). El `usuario.id` que el paso 10
necesita para contar fundaciones se puede resolver sin insertar: si el usuario no
existe todavía, tiene 0 fundaciones por definición.

---

### R-5 · menor hoy, latente · El alta adopta una base que ya existe

**Dónde**: `backend/app/clientes.py:307-313` (el `already exists` del
`CREATE DATABASE` se traga a propósito y el flujo sigue) y
`backend/app/clientes.py:293` (el duplicado se chequea con `buscar()`, que mira
el **registro**, no el motor). Con `backend/app/clientes.py:114-118`
(`motor_de` devuelve el motor por defecto cuando `db_name == _db_por_defecto()`).

**Qué pasa.** `crear_cliente` no distingue "creé una base nueva" de "ya había
una y me metí adentro": crea las tablas y la configuración en la base que
encontró. Hasta la Fase 2 eso lo llamaba un humano con acceso al servidor; ahora
lo llama internet. Dos consecuencias:

1. Cualquier base `recabra_<slug>` de la misma instancia de Postgres que no
   tenga fila en `clientes` es reclamable por quien adivine el slug — y el alta
   le crea las tablas de RECABRA adentro.
2. Si `DATABASE_URL` apuntara a una base llamada `recabra_<algo>`, fundar el
   slug `<algo>` produce `db_name == _db_por_defecto()`, `motor_de` entrega el
   **motor por defecto**, y el fundador nace `admin` sobre la base del cliente
   por defecto: los datos de galerías, el registro de clientes y `estados_cliente`
   incluidos.

**Por qué es menor HOY.** La base de producción se llama `retail_espacios`
(`render.yaml:3`), que no matchea `recabra_*`, así que (2) no es alcanzable; y en
el Postgres de producción no hay bases `recabra_*` huérfanas, así que (1)
tampoco. Es un renombre de base —o un despliegue nuevo con otro nombre— de
distancia, y el endpoint que lo alcanza ahora es público.

**R-0 y R-5 son la misma familia, y se tocan.** La corrida de la suite deja en
el repo un `backend/recabra_nuevomarket.db` — una base huérfana de verdad. Hoy
no se puede reclamar porque su `ClienteRow` quedó en el archivo de al lado y el
alta contesta 409; borrá sólo `retail_espacios.db` y dejá la otra, y la próxima
alta de `nuevomarket` se mete adentro de la base vieja. Es el escenario (1) de
arriba, montado por accidente en dos comandos.

**Ataque que lo demuestra**: `test_r5_el_alta_no_debe_adoptar_una_base_que_ya_existe`.

**Sugerencia**: dos líneas en `crear_cliente` — rechazar cuando
`nombre_de_base(slug) == _db_por_defecto()`, y no tragarse el `already exists`
(o al menos no tragárselo cuando lo llama el alta self-service).

---

## 4. Consecuencias del contrato, deliberadas — para que estén escritas

No son defectos: el contrato las decidió así y no se re-litigan acá. Van con
test para que la decisión quede visible y no se redescubra en producción.

### R-6 · El alta es una puerta lateral a la suspensión

`POST /api/clientes/alta` no pasa por `cliente_del_pedido` —no puede: quien
funda todavía no tiene cliente—, así que el interruptor no lo alcanza. Un owner
al que le cortaron el servicio por no pagar funda un cliente nuevo y sigue
trabajando; lo único que lo acota es el tope de dos fundaciones, y una cuenta de
Google nueva devuelve el contador a cero. Test:
`test_c1_el_alta_es_una_puerta_lateral_a_la_suspension`.

Si algún día molesta, el freno natural es por identidad (no dejar fundar a quien
ya es owner de un cliente suspendido), no por interruptor.

### R-7 · `solo_lectura` no es sólo lectura para `/api/auth` ni `/api/usuarios`

Las dos exenciones de la spec (decisión 3) existen para que el owner pueda
entrar y pagar. El precio, medido: `PUT /api/auth/passwords` escribe en la base
**del cliente** (hash y época en `app_config`, y cierra las sesiones del rol) y
`POST /api/usuarios/invitar` sigue dando de alta gente. Test:
`test_c2_solo_lectura_no_es_solo_lectura_para_auth_ni_para_usuarios`.

### `HEAD` y `OPTIONS` en `_METODOS_DE_LECTURA` son letra muerta

A diferencia de `starlette.routing.Route`, el `APIRoute` de FastAPI **no** le
suma HEAD a las rutas GET: HEAD y OPTIONS mueren en 405 en todo `/api` antes de
tocar una dependencia (54 combinaciones verificadas). Los dos verbos en
`clientes.py:362` no abren nada hoy; abrirían el día que alguien monte una ruta
HEAD explícita. Queda anotado, no es hallazgo.

---

## 5. Sospechas — sin test que las demuestre, no son hallazgos

1. **El cache de estado es por proceso.** `invalidar_cache_estado` (60 s de TTL)
   limpia el diccionario del worker que atendió el PATCH. Con más de un worker o
   más de una instancia en Render, los demás siguen sirviendo el estado viejo
   hasta un minuto: un cliente recién suspendido opera un minuto más, y —peor
   para el negocio— uno que acaba de pagar queda cortado un minuto más. No es
   demostrable con `TestClient`, que corre un proceso. Mismo patrón que el cache
   de membresía de la Fase 1, así que es una limitación conocida y aceptada; lo
   anoto porque acá el que espera es un cliente que pagó.
2. **La exención de plataforma es un `startswith`.** `path.startswith(
   "/api/plataforma")` (`clientes.py:399`) no compara segmentos. Hoy es
   inexplotable: ninguna ruta de negocio empieza así, y `..` lo normaliza el
   cliente HTTP antes de salir. Sería un bypass sólo si un proxy delante
   reescribiera el path después de que Starlette lo lea, que no es el caso en
   Render. No lo pude reproducir con `TestClient`.
3. **Un operador cuyo `ClienteRow` quedara `activo=False` pierde el panel.**
   `cliente_del_pedido` levanta 401 antes de que `require_operador` mire nada, y
   el panel del operador cuelga de un token de negocio. Falla cerrado (bien),
   pero es una trampa de disponibilidad: el operador que apague al cliente
   equivocado —el suyo— se queda sin la herramienta para arreglarlo. Hoy no hay
   endpoint que desactive un cliente, así que no hay ataque que escribir.
4. **Los estados desconocidos pasan a propósito** (`clientes.py:412`). El PATCH
   normaliza y valida, así que hoy no hay camino para escribir uno raro (probado
   en `test_f2_…`). La advertencia es para el día de la pasarela de pago: su
   webhook va a escribir esa tabla, y si escribe `"suspended"` o `"SUSPENDED"`
   el panel va a decir suspendido y el cliente va a seguir operando.

---

## 6. Estado de la suite

Sólo este archivo:

```
$ cd backend && TMPDIR=<escribible> python -m pytest tests/test_plataforma_ataques.py -q
25 passed, 5 xfailed
```

La suite COMPLETA de la rama, con `TMPDIR` sano y con
`backend/retail_espacios.db` recién borrado antes de arrancar:

```
354 tests · 346 passed · 7 xfailed (2 de la Fase 1 + los 5 míos) · 1 failed
el único failed es tests/test_alta.py::test_alta_feliz_funda_owner_y_base_vacia,
que es R-0 (arriba): el archivo del repo lo había dejado sucio una corrida previa.
```

Los 5 `xfail` son R-1 … R-5. Están en `strict=True`: cuando el builder tape
cualquiera de esos agujeros, ese test pasa a XPASS y la suite se pone roja hasta
que alguien saque el marcador y lo convierta en test de regresión — que es
exactamente lo que se hizo en la Fase 1 con H-1 … H-6.
