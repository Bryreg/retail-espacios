# Backend — Interruptor de estado de cuenta (Fase 2)

Builder B · rama `claude/fase-2-clientes` · sin commit ni push.

## Qué quedó construido

El corte por estado de cuenta vive en **un solo lugar**: `_aplicar_estado()` en
`backend/app/clientes.py`, llamado desde los dos caminos de `cliente_del_pedido`
que devuelven un cliente. Ningún router repite el chequeo — y por lo tanto
ninguno puede olvidárselo. Los dos logins, que **no** pasan por ahí, llevan el
gating explícito en `backend/app/routers/auth.py`.

### Archivos

| Archivo | Qué pasó |
|---|---|
| `backend/app/models/plataforma.py` | **Ya existía, byte-a-byte idéntico al contrato §2.1** (lo creó builder A en paralelo). No se tocó. |
| `backend/app/plataforma_estado.py` | **Ya existía, byte-a-byte idéntico al contrato §2.1**. No se tocó. |
| `backend/app/clientes.py` | Editado: import de `plataforma_estado` a nivel de módulo + `_aplicar_estado()` + las dos llamadas en `cliente_del_pedido`. |
| `backend/app/routers/auth.py` | Editado: `AvisoCuenta`, `LoginOut.aviso_cuenta`, `_aviso_de()`, gating en `/login` y en `/oauth`. |
| `backend/tests/test_estado_cuenta.py` | Nuevo: 15 pruebas. |

Verificado con la comprobación de conflicto que pedía el contrato: los dos
archivos compartidos coinciden carácter por carácter con el bloque de §2.1, así
que no hubo conflicto que reportar.

## La semántica, tal cual quedó

```
estado, motivo = plataforma_estado.estado_de(cliente.slug)

"activo" | "gracia"                    → pasa
path.startswith("/api/plataforma")     → pasa SIEMPRE
"solo_lectura":
    método ∈ {GET, HEAD, OPTIONS}      → pasa
    path ∈ {/api/auth, /api/usuarios}  → pasa
    resto                              → 402 "Cuenta en solo lectura por pago pendiente."
"suspendido"                           → 402 "La cuenta de este cliente está suspendida."
                                          (todo método, GET incluido)
otro valor (fila escrita a mano)       → pasa (ver decisión 4)
```

Los mensajes viven como constantes en `clientes.py`
(`CUENTA_SOLO_LECTURA`, `CUENTA_SUSPENDIDA`); `auth.py` repite sólo
`CUENTA_SUSPENDIDA` para no importar `clientes` por un string.

## Decisiones que tomé (y por qué)

1. **El corte es al pedido HTTP, jamás a la sesión de base.** Es lo que hace que
   `GET /api/spaces/map` —que llama a `expire_leases()`, o sea que ESCRIBE
   adentro de un GET— siga funcionando en `solo_lectura`. Si el bloqueo hubiera
   vivido en la sesión (una sesión de sólo lectura, digamos), ese GET permitido
   se caería al vencer un contrato. Hay una prueba dedicada que siembra un
   contrato vencido, pega el GET con el cliente en `solo_lectura`, y verifica
   que contestó 200 **y que el contrato quedó dado de baja y el espacio libre**.

2. **El 402 del login legado va DESPUÉS de comprobar la contraseña.** El
   contrato dice "resuelto el cliente"; resolverlo es condición necesaria, no
   una orden de contestar ahí mismo. Contestar 402 antes de la clave convertiría
   la pantalla de ingreso en un oráculo de qué supermercados dejaron de pagar,
   para cualquiera que sepa un slug — que es exactamente el ataque que el
   `login()` de este repo ya evita cuando hace que un cliente inexistente
   conteste "Contraseña incorrecta" en vez de "ese supermercado no existe". Con
   clave equivocada sigue siendo 401; con clave correcta y cuenta suspendida,
   402. Hay prueba de las dos ramas.
   En `/oauth` el chequeo va donde dice el contrato (con la membresía elegida y
   `cliente_obj` resuelto), porque ahí el ID token YA está verificado: el 402 no
   le cuenta nada a nadie que no fuera de la casa.

3. **`aviso_cuenta` se omite en vez de mandarse en `null`.** El guardrail pide
   que el login de un cliente activo no cambie en un byte. Con
   `Optional[AvisoCuenta] = None` a secas, FastAPI serializaría
   `"aviso_cuenta": null` y el cuerpo cambiaría. La ruta `/login` lleva
   `response_model_exclude_none=True` (LoginOut no tiene ningún otro campo
   opcional, así que no arrastra nada más) y `/oauth`, que devuelve un dict,
   agrega la clave sólo cuando hay algo que avisar. Prueba explícita:
   `set(cuerpo) == {"token","role","cliente","cliente_nombre"}`.

4. **Un estado desconocido deja pasar.** El PATCH del operador valida contra
   `ESTADOS_CUENTA`, así que una fila con otro valor sólo puede venir de una
   escritura a mano. Ante algo que no entiende, el interruptor prefiere no
   cortarle el servicio a un cliente que paga: falla abierto, y el estado
   desconocido no otorga ningún privilegio que "activo" no tenga.

5. **El `/oauth` de un token válido nunca cuenta como intento fallido**, ni
   siquiera cuando termina en 402: antes de levantar la excepción se llama a
   `borrar_fallos(reg, ip, modelo=IntentoOauth)`, igual que ya hace la rama de
   multi-membresía por el mismo motivo ("el ID token SÍ era válido").

6. **`elegida.rol != "owner"`, no `role != "admin"`.** La excepción del
   suspendido es del owner, no del rol del JWT: un `admin` de membresía mapea a
   `role == "admin"` igual que el owner, y darle entrada sería regalarle la
   excepción a media planta. Hay prueba de owner (entra, con motivo) y de worker
   (402, sin motivo en el cuerpo).

7. **El owner que entra a una cuenta suspendida entra a ver y a pagar, no a
   trabajar.** Su token sale bien, pero el pedido siguiente choca con el mismo
   402 del interruptor. Está probado, porque es justo la clase de cosa que se
   asume y no se verifica.

## El detalle de los imports

`clientes.py` importa `app.plataforma_estado` **a nivel de módulo**, no adentro
de la función. Dos efectos, los dos buscados:

- registra `estados_cliente`, `alta_attempts` y `fundaciones` en
  `Base.metadata` antes de que el `lifespan` de `main.py` llame a
  `create_all()` — `main.py` no necesita importar nada (§2.3);
- deja el corte a la vista de quien lea el archivo.

No hay ciclo: `models/plataforma.py` sólo importa `app.database`, y
`app.database` no importa `app.clientes` a nivel de módulo (su `get_db` lo
importa adentro de la función).

## Las pruebas (`backend/tests/test_estado_cuenta.py`, 15)

El estado se siembra escribiendo `EstadoCliente` con `sesion_registro()` y
llamando a `plataforma_estado.limpiar_cache_estado()` — nunca por el PATCH del
operador, que es de otro builder. Todos los `import app.*` van adentro de las
funciones.

- fila ausente → GET 200, POST 201, cuerpo del login sin `aviso_cuenta`
- fila `"activo"` → idéntico a fila ausente
- `gracia` → nada se corta; los dos logins traen `aviso_cuenta` con motivo
- `solo_lectura` → GET `/api/spaces/` y `/api/suppliers/` 200
- `solo_lectura` → **`GET /api/spaces/map` 200 con contrato vencido sembrado, y
  el contrato queda inactivo y el espacio libre** (la prueba del corte-al-pedido)
- `solo_lectura` → `POST /api/suppliers/` y `POST /api/spaces/find-or-create`
  402 con el mensaje exacto
- `solo_lectura` → `POST /api/usuarios/invitar` 200 y `PUT /api/auth/passwords`
  200 (exentos)
- `solo_lectura` → los dos logins 200 + `aviso_cuenta`
- `suspendido` → GET 402, POST 402, `GET /spaces/map` 402
- `suspendido` → login legado 402 en los dos roles, sin motivo en el cuerpo
- `suspendido` → login legado con clave equivocada sigue dando 401 (no-oráculo)
- `suspendido` → oauth de worker 402 sin motivo; oauth de owner 200 con motivo
- `suspendido` → el token del owner igual choca 402 en el pedido siguiente
- `invalidar_cache_estado` → activo cacheado → suspendido → invalidar → 402
- aislamiento por cliente: suspender `otromarket` no roza a `galerias`

## Verificación

- `cd backend && python -m pytest` — **suite COMPLETA verde: 324 pasadas, 2
  xfail, 0 fallas**, incluidas las 15 nuevas y las de `test_alta.py` de
  builder A. Exit 0.
- `cd backend && python -c "import app.main"` — OK.
- Frontend intacto (no es mi territorio; no toqué un archivo de `frontend/`).

> **Aviso para quien corra la suite mientras hay varios agentes trabajando.**
> La primera corrida dio seis fallas raras —`sqlite3.OperationalError: attempt
> to write a readonly database` en `test_clientes.py`, `test_alta.py` y
> `test_identidad_ataques.py`— y ninguna era del código. El `conftest.py`
> guarda cada base de prueba en el directorio temporal del sistema y, al
> terminar, borra con `glob` **todos** los `recabra_*.db` de esa carpeta: dos
> pytest simultáneos en la misma máquina se borran las bases entre sí a mitad
> de prueba. Corriendo con `TMPDIR` propio
> (`TMPDIR=/ruta/mia python -m pytest`) las seis desaparecen. Vale la pena que
> el auditor de regresión lo sepa antes de acusar a nadie — y quizá que alguna
> sesión futura le ponga un subdirectorio propio por corrida a ese `glob`.
- `git diff` de `models/models.py` y `models/identidad.py`: vacío. Sin
  migraciones: `estados_cliente` es tabla nueva y la fila ausente es activo.
- La redacción de dinero por rol no se tocó; el JWT no cambió de forma
  (`aviso_cuenta` es campo de respuesta, jamás claim).

## Lo que dejé afuera a propósito (para el auditor y el red team)

- **Un login legado rechazado por suspensión no deja línea en la bitácora.** El
  código de acción tendría que sumarse al diccionario `ACCIONES` de
  `services/bitacora.py`, que está fuera de mi territorio. Es un hueco chico de
  auditoría, no de seguridad: el intento no otorga nada.
- **`/api/plataforma` pasa siempre, para cualquier estado.** Es lo que pide el
  contrato (un operador con su propio cliente degradado tiene que poder
  operar), y la autorización de ese prefijo la pone `require_operador` en el
  router de builder A — el interruptor no es la puerta de ese panel, sólo se
  corre del camino.
- **El cache de 60 s aplica también al 402.** Un cliente que pagó puede seguir
  viendo el corte hasta un minuto si nadie llama a `invalidar_cache_estado`; el
  PATCH del operador la llama, así que en el camino normal se siente en el
  pedido siguiente (probado).
