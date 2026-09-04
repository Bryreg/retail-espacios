# Auditoría de regresión y coherencia — Fase 2 (Clientes)

Rama `claude/fase-2-clientes` sobre `claude/fase-1-identidad`, repo
`/tmp/retail-espacios-test`. Todo el trabajo de los tres builders está sin
commitear (working tree); no se hizo commit ni push desde esta auditoría.

## Veredicto global: **COHERENTE — SÍ**

El código de los tres builders cumple el contrato de
`features/clientes/outputs/equipo-fase-2.md` punto por punto, no toca ninguna
regla dura, y la suite completa de pytest pasa limpia (324 tests, 0 fallos,
`EXITCODE=0`) en una corrida aislada de un solo proceso. `tsc --noEmit` no
imprime nada. No hay ningún BLOQUEANTE atribuible a los builders de esta fase.

Hay **un hallazgo operativo real y reproducible** que amenaza la propiedad
"suite completa verde" bajo condiciones normales (correr pytest más de una
vez sobre el mismo checkout, o dos procesos compartiendo el mismo directorio
de trabajo) — ver §5. No es un defecto de ningún agente de esta fase: la
causa raíz es un archivo pre-existente, fuera de todos los territorios de la
Fase 2, y el propio código de Fase 2 no hace nada mal. Lo marco como
**bloqueante para "suite verde" en general**, pero de un tipo que ningún
builder de esta fase puede arreglar (no está en su territorio) — el
destinatario correcto es el Maestro / una limpieza aparte. Por eso el
veredicto de coherencia de la Fase 2 en sí sigue siendo SÍ.

---

## 1. Regresión

| Verificación | Resultado | Evidencia |
|---|---|---|
| `cd backend && python -m pytest` — suite completa | **VERDE** (324 tests, 2 corridas limpias consecutivas, `EXITCODE=0`) | Ver §5 para el matiz: sólo es fiable en una corrida aislada — la primera de un checkout, o borrando `backend/*.db` antes de correr |
| `cd backend && python -c "import app.main"` | OK, sin salida ni excepción | ejecutado directo |
| `cd frontend && npx tsc --noEmit` (con `npm install --legacy-peer-deps` antes) | OK, sin salida | ejecutado directo |
| `git diff` sobre `backend/tests/` — sólo archivos NUEVOS, ninguno preexistente tocado | **Confirmado** | `git status --porcelain backend/tests/` → sólo `??` (untracked) para `test_alta.py`, `test_estado_cuenta.py`, `test_plataforma.py` (builders) y `test_plataforma_ataques.py` (red team). `git diff --stat -- backend/tests/` vacío |

No hay ningún test preexistente borrado, modificado ni "acomodado para pasar".

---

## 2. Reglas duras

| Regla | Resultado | Evidencia |
|---|---|---|
| `git diff` de `models/models.py` VACÍO | **Confirmado** | `git diff -- backend/app/models/models.py` sin salida |
| `git diff` de `models/identidad.py` VACÍO | **Confirmado** | `git diff -- backend/app/models/identidad.py` sin salida |
| Tablas nuevas sólo en `models/plataforma.py` | **Confirmado** | Único archivo de modelos nuevo; `EstadoCliente`/`IntentoAlta`/`Fundacion`, las tres tablas del contrato §2.1, nada más |
| El JWT no cambió de forma | **Confirmado** | `app/auth.py` sin ningún diff (archivo completo intacto); `create_token()` idéntico a Fase 1, `alta.py` y `oauth_login` lo llaman con el mismo patrón `(role, epoca, slug, sub=, email=)` ya existente |
| Redacción de dinero por rol intacta | **Confirmado** | `git diff -- backend/app/routers/spaces.py backend/app/routers/layout.py backend/app/routers/dashboard.py` vacío — Fase 2 no tocó ninguno |
| El interruptor vive SOLO en `clientes.py` (más los dos puntos explícitos de login) | **Confirmado** | `grep -rn "estado_de\|402" backend/app --include=*.py` (fuera de tests) da únicamente: `clientes.py::_aplicar_estado` (el middleware) y `routers/auth.py` en `login` y `oauth_login` (los dos puntos que el contrato §2.2-F documenta como excepción explícita, porque esos endpoints no pasan por `cliente_del_pedido`). Ningún otro router (`spaces.py`, `layout.py`, `usuarios.py`, etc.) tiene un chequeo de estado propio |
| Login legado de un cliente activo responde byte a byte igual | **Confirmado** | `LoginOut.aviso_cuenta: Optional[AvisoCuenta] = None` + `response_model_exclude_none=True` en la ruta: el campo queda AUSENTE del JSON (no `null`) cuando el cliente está activo. El resto de `LoginOut` no cambió |

---

## 3. Archivos compartidos (contrato §2.1)

`backend/app/models/plataforma.py` y `backend/app/plataforma_estado.py` se
leyeron completos y se compararon carácter a carácter contra el bloque
verbatim de `equipo-fase-2.md` §2.1: **idénticos**, sin ninguna diferencia.
Ambos builders (A y B) los dejaron byte-a-byte iguales, como pedía el
contrato — cero conflicto entre ramas paralelas.

`app/main.py` sólo tiene las 4 líneas que el contrato §2.3 autoriza a tocar
(dos imports + dos `include_router`); `git diff` confirma que no se tocó nada
más en ese archivo.

---

## 4. Checklist de la spec (`features/clientes/spec.md` § Verificación)

| Punto de la spec | Cubierto por | Evidencia |
|---|---|---|
| Usuario nuevo sin invitación → funda → entra como owner | `test_alta.py::test_alta_feliz_funda_owner_y_base_vacia` | Verifica 200, `role=admin`, membresía `owner` activa, `Fundacion` registrada, base nueva sin pasillos (`Space.count()==0`), y que el token sirve contra `/api/spaces/` |
| Slug reservado o duplicado → error claro, sin cliente a medias | `test_slug_reservado_da_409`, `test_slug_duplicado_con_galerias_da_409` | 409 con el mismo `detail` ("tomado"); el orden del router (validación de slug antes de `crear_cliente`, paso irreversible al final) garantiza que nunca se llega a crear una base a medias en estos casos |
| Tercer intento de fundar → rechazado (máx 2) | `test_tercer_intento_del_mismo_usuario_da_403` | Dos altas OK, la tercera 403 "máximo" |
| `gracia`: entra normal + `aviso_cuenta` presente | `test_estado_cuenta.py::test_gracia_no_corta_nada_y_avisa_en_los_dos_logins` | Ambos logins (legado y oauth) devuelven `aviso_cuenta` con `estado="gracia"` y las mutaciones de negocio siguen funcionando |
| `solo_lectura`: GET 200, POST de contrato 402 con mensaje | `test_solo_lectura_deja_leer`, `test_solo_lectura_corta_las_mutaciones_de_negocio`, `test_solo_lectura_no_rompe_el_get_que_escribe_por_dentro` | Este último es el caso fino del contrato: un GET permitido que dispara `expire_leases()` por dentro no se rompe — el corte es al pedido HTTP, no a la sesión |
| `suspendido`: owner ve el motivo al entrar; worker no entra | `test_suspendido_deja_afuera_al_worker_y_adentro_al_owner_con_el_motivo`, `test_suspendido_no_deja_entrar_por_el_login_legado`, `test_el_owner_que_entro_a_una_cuenta_suspendida_igual_no_opera` | El legado (que nunca es owner) también da 402 sin excepción; el owner ve el motivo pero sigue sin poder operar sobre datos de negocio (sólo `/api/plataforma/*`, `/api/auth`, `/api/usuarios`) |
| Cliente sin fila en `estados_cliente` = exactamente como hoy | `test_sin_fila_en_estados_cliente_todo_sigue_exactamente_igual`, `test_fila_con_estado_activo_es_lo_mismo_que_no_tener_fila` | Cubre explícitamente el caso de galerias y todo cliente preexistente |
| No-operador → 403; legado → 403 siempre | `test_get_clientes_403_para_no_operador_y_legado`, `test_soy_false_para_legado`, `test_patch_requiere_operador` | El legado nunca trae `actor_email`, así que `require_operador` da 403 por construcción, sin chequeo especial |
| Suite completa verde + tsc limpio | Ver §1 | — |

Los 15 tests de `test_estado_cuenta.py` (builder B) y los 12 de
`test_plataforma.py` + 10 de `test_alta.py` (builder A) cubren, entre los
tres, cada ítem de la spec con al menos un test dedicado. No encontré ningún
punto de la spec sin cobertura.

---

## 5. Regresión de aislamiento de tests — hallazgo operativo (no atribuible a Fase 2)

**Síntoma observado**: en varias corridas de la suite COMPLETA sobre el
checkout compartido (`/tmp/retail-espacios-test/backend`), el primer test
colectado (`test_alta.py::test_alta_feliz_funda_owner_y_base_vacia`) falló de
forma no determinística — a veces con `sqlite3.OperationalError: attempt to
write a readonly database`, a veces con `409 Ese código ya está tomado` para
el slug `"nuevomarket"` que el test funda.

**Causa raíz, confirmada por inspección directa**:

`backend/tests/test_correo_api.py` (archivo PRE-EXISTENTE, no tocado por
ningún agente de esta fase — `git diff` sobre él está vacío) tiene, a nivel
de módulo, `from app.services import mailer` (línea 17). `mailer.py` importa
`from app.auth import get_config`, que transitivamente importa
`app.database`. Pytest **colecciona** (importa) todos los archivos de test
ANTES de correr el fixture `client()` de ningún test — así que ese import de
`test_correo_api.py` dispara, durante la colección, el binding a nivel de
módulo de `app.database.engine`/`SessionLocal` contra el `DATABASE_URL` de
ese instante: como el fixture `client()` todavía no corrió, no hay
`DATABASE_URL` puesto, y `app/database.py` cae a su default:

```python
_raw_url = os.getenv("DATABASE_URL", "sqlite:///./retail_espacios.db")
```

Un archivo REAL, relativo al `cwd`, adentro de `backend/`. Como Python cachea
módulos importados, el `import app.database` que el fixture `client()` hace
después (ya con `DATABASE_URL` puesto al tempfile de la prueba) es un
NO-OP — el motor ya estaba creado. Sólo el PRIMER test de toda la sesión
paga esto: su `finally` del fixture purga `sys.modules` para todo `app.*`, así
que desde el segundo test en adelante cada uno arma su motor limpio contra su
propio tempfile.

Verificación directa:

```
$ python3 -c "
import sqlite3
c = sqlite3.connect('retail_espacios.db')
print(c.execute('select slug, nombre from clientes').fetchall())
"
[('galerias', 'Galerías'), ('nuevomarket', 'Nuevo Market')]
```

`backend/retail_espacios.db` (y el `backend/recabra_nuevomarket.db` hermano
que `crear_cliente` le abre al lado) quedan **en el directorio de trabajo del
repo**, gitignorados pero NO limpiados por ningún fixture — a diferencia de
los tempfiles de `/tmp`, que sí se borran en el teardown. Por eso persisten
entre corridas: la primera vez que alguien corre la suite completa, el primer
test funda "nuevomarket" ahí sin que nadie lo note (pasa igual, porque es la
primera vez que existe); la SEGUNDA corrida sobre el mismo checkout choca con
la fila que quedó, y el primer test de la suite falla con 409 en cada corrida
subsiguiente hasta que alguien borre esos `.db` a mano. Si además dos
procesos corren la suite completa sobre el mismo checkout al mismo tiempo
(este contenedor tiene, en efecto, más de un agente trabajando sobre el mismo
`/tmp/retail-espacios-test` en paralelo), compiten por escribir el mismo
archivo real y aparece el `readonly database`.

**Confirmé el mecanismo de punta a punta**:
- Un worktree aparte de SOLO `claude/fase-1-identidad` (que también tiene
  `test_correo_api.py`, sin cambios) deja el mismo `retail_espacios.db`
  huérfano tras correr su suite — el bug es anterior a esta fase — pero su
  suite (sin `test_alta.py`) nunca choca con contenido residual, así que
  nunca se vio como una falla visible hasta que Fase 2 agregó el primer test
  sensible a duplicados de slug.
- Borrando `backend/retail_espacios.db` y `backend/recabra_*.db` y corriendo
  la suite completa en un solo proceso (dos veces, cada una limpia y sin otro
  proceso pytest corriendo en paralelo): **324 passed, EXITCODE=0**, las dos
  veces.

**Por qué no es un defecto de los builders de esta fase**: `test_correo_api.py`
no está en el territorio de ningún agente de la Fase 2 (ni builders ni yo);
`app/database.py` tampoco. El código nuevo de Fase 2 (`alta.py`, `plataforma.py`,
el interruptor en `clientes.py`) no participa del mecanismo — sólo es la
primera víctima porque `test_alta.py` es alfabéticamente el primer archivo de
test y el primero en depender de que un slug no exista todavía.

**A quién le toca (segunda ronda)**: al Maestro, como tarea de limpieza fuera
del territorio de esta fase — ningún builder de Fase 2 puede tocar
`test_correo_api.py` sin salirse de su territorio. Arreglo sugerido, uno de:
(a) mover `from app.services import mailer` adentro de las funciones de
`test_correo_api.py`, igual que hacen todos los demás archivos de test (es el
patrón que el propio docstring de `conftest.py` ya pide); o (b) hacer que
`app/database.py` arme el engine de forma perezosa (dentro de una función) en
vez de al importar el módulo. La opción (a) es un cambio de una línea y no
toca ningún contrato de esta fase.

**Clasificación**: operativamente bloqueante para "suite verde" a repetición
(afecta a cualquiera que corra `pytest` dos veces seguidas en el mismo
checkout, incluido cualquier loop de desarrollo local), pero fuera del
alcance y del territorio de los 3 builders de Fase 2 — no cambia el veredicto
de coherencia de su trabajo.

**Corroborado de forma independiente por el red team** (`red-team-privilegio.md`
§0, hallazgo "R-0"): llegaron a la misma causa raíz, la misma línea
(`test_correo_api.py:17`) y la misma evidencia (el contenido de
`retail_espacios.db`), sin coordinación conmigo. Agregan una alternativa de
arreglo — que `conftest.py` purgue `sys.modules['app.*']` también al ENTRAR al
fixture `client`, no sólo al salir — como cinturón además del import perezoso
en `test_correo_api.py`. Dos auditorías independientes llegando al mismo
diagnóstico es la mejor confirmación posible de que esto es real y no un
artefacto de mi propio entorno.

---

## 6. Coherencia entre agentes (frontend ↔ backend)

Se grepeó `frontend/src` por `/api/clientes/alta` y `/api/plataforma` y se
comparó cada llamada contra el router correspondiente:

| Llamada frontend | Archivo | Backend | Coincide |
|---|---|---|---|
| `POST /clientes/alta` `{id_token, slug, nombre}` → `{token, role, cliente, cliente_nombre, email, nombre}` | `api/clientes.ts::altaCliente` | `routers/alta.py` | **Sí**, shape idéntico en ambos lados incluidos los nombres de campo |
| `GET /plataforma/soy` → `{operador: bool}` | `api/plataforma.ts::soyOperador` | `routers/plataforma.py::soy_operador` | **Sí** |
| `GET /plataforma/clientes` → `{clientes: [...]}` | `api/plataforma.ts::getClientesPlataforma` | `routers/plataforma.py::listar_clientes_plataforma` | **Sí**, mismos 7 campos por fila |
| `PATCH /plataforma/clientes/{slug}` `{estado, motivo}` → fila actualizada | `api/plataforma.ts::patchEstadoCliente` | `routers/plataforma.py::cambiar_estado_cliente` | **Sí** |

Los mensajes de error que muestra el frontend (`describeError`, en
`altaError`/`error` de `PlataformaPanel` y `Login.tsx`) se toman del
`detail` real de la respuesta del backend — no hay strings inventados en el
cliente que dupliquen o diverjan de los que emite el backend. El flujo de
"sin membresías → ofrecer fundar" en `Login.tsx` usa `obtenerIdTokenFresco()`
(token FRESCO, no el que ya rechazó `/oauth`), coherente con el motivo que
`equipo-fase-2.md` documenta para eso.

`AvisoCuenta`/`avisoCuenta` en `authStore.ts` se persiste junto con el resto
de la sesión (a diferencia de la lista del panel de plataforma, que
deliberadamente NO toca `localStorage`) — coherente con que es estado de
ESTA cuenta y no datos de otros clientes.

No encontré ninguna divergencia de contrato entre frontend y backend.

---

## 7. Conflictos

### Bloqueantes atribuibles a un agente de la Fase 2

**Ninguno.**

### Bloqueante operativo, fuera de territorio de la Fase 2

| # | Hallazgo | Para quién (segunda ronda) |
|---|---|---|
| 1 | `test_correo_api.py` (pre-existente) importa `app.services.mailer` a nivel de módulo, lo que fija `app.database` contra `sqlite:///./retail_espacios.db` durante la colección de pytest, antes de que el fixture `client()` ponga el `DATABASE_URL` de prueba. El primer test de CADA corrida completa de la suite paga esto; en corridas repetidas sobre el mismo checkout (sin borrar los `.db` sueltos de `backend/`) el primer test falla. Ver §5 para reproducción completa. | Maestro — fuera del territorio de los 3 builders de Fase 2; arreglo de una línea en `test_correo_api.py` (import perezoso, como todos los demás archivos de test) |

### Menores

Ninguno adicional — el código de los tres builders está limpio, completo y
coherente con el contrato en cada punto revisado.

### Nota — hallazgos del red team (fuera de mi mandato, referenciados por coherencia)

`features/clientes/outputs/red-team-privilegio.md` reporta dos hallazgos
**mayores** de superficie de denegación (R-1: el 402 del interruptor se
contesta sin credencial y delata el estado de cuenta a un desconocido; R-2:
`aviso_cuenta.motivo` en `gracia`/`solo_lectura` le llega a workers y no sólo
al owner, a diferencia de `suspendido` donde el propio código ya protege el
motivo). No contradicen ningún punto de mi checklist — la spec no exige
literalmente lo que R-1/R-2 piden, son endurecimientos de privilegio más allá
de la letra del contrato — así que no cambian mi veredicto de regresión, pero
quedan anotados acá para que la segunda ronda no los pierda de vista: le
tocan al builder A (`routers/auth.py` para R-2) y a B (`clientes.py` para
R-1), según el territorio de cada archivo.

---

## 8. Verificación de cierre (equipo-fase-2.md §4)

| Ítem | Resultado |
|---|---|
| `pytest` completo verde | ✅ (corrida aislada — ver §5 sobre el matiz de corridas repetidas) |
| `import app.main` | ✅ |
| `npx tsc --noEmit` | ✅ |
| Checklist de la spec | ✅ — cada punto con test dedicado (§4) |
| `git diff` de `models.py`/`identidad.py` vacío | ✅ |
| Archivos compartidos idénticos al contrato | ✅ |
| `docs/ESTADO.md` actualizado con la sección de Fase 2 | ✅ — agregada en este mismo PR de auditoría |
