# Auditoría integral — dimensiones 1 y 2 (ingreso al sistema / login + aislamiento multi-tenant y base de datos)

Agente: `ingresos`. Archivo de test: `backend/tests/test_auditoria_ingresos.py`
(14 passed, 2 xfailed; corrido dos veces en serie con `TMPDIR=/tmp/pt-ingresos`).
No se tocó una sola línea de producción: soy auditor.

Comando de verificación:

```
cd /tmp/retail-espacios-test/backend && mkdir -p /tmp/pt-ingresos && \
  TMPDIR=/tmp/pt-ingresos python -m pytest -q tests/test_auditoria_ingresos.py
# 14 passed, 2 xfailed
```

---

## Tabla de hallazgos

| id | severidad | dimensión | título | reproducción | arreglo propuesto |
|---|---|---|---|---|---|
| **ingresos-1** | **media** | 2 (aislamiento / superficie de denegación) | Un `Bearer` basura reabre el oráculo de estado de cuenta que cerró R-1 | `test_ingresos_1_un_bearer_basura_no_debe_delatar_el_estado_de_cuenta` (xfail strict) + sonda literal abajo | que `_aplicar_estado` corra sólo con credencial **que resuelva un cliente**, no con "hubo texto en el header" |
| **ingresos-2** | baja | 2 (defensa en profundidad) | Las exenciones del interruptor comparan prefijo sin frontera de segmento | `test_ingresos_2_las_exenciones_del_interruptor_no_deben_ser_prefijo_suelto` (xfail strict) | reusar el patrón de `_es_path_de_plataforma` (H-3) para `_EXENTOS_EN_SOLO_LECTURA` y `_EXENTOS_POR_HABEAS_DATA` |
| **ingresos-3** | baja | 1 (Firebase) | `leeway=60` alarga también el `exp`: un ID token vencido hace <60 s todavía verifica | `test_ingresos_3_el_leeway_de_60s_tambien_alarga_el_exp` (caracterización, verde) | ninguno urgente; si se quiere cerrar, `jwt.decode(..., leeway=60)` + un segundo chequeo explícito de `exp` sin tolerancia |
| **ingresos-4** | baja | 1 (alta / operación) | Una falla de infraestructura del alta (`CREATE DATABASE` denegado) se le muestra al fundador como «Ese código ya está tomado» | `test_ingresos_15_una_falla_de_infraestructura_del_alta_se_disfraza_de_slug_tomado` (verde, imprime la respuesta literal) | separar `ErrorDeAlta` de validación (409) de `ErrorDeAlta` de infraestructura (503 + log), y no dejar el `Usuario` huérfano en ese camino (R-4) |
| **ingresos-5** | baja | 2 (crecimiento de la base) | `bitacora_plataforma` y `snapshot_metricas` crecen sin ninguna purga (`audit_log` sí la tiene) | `test_ingresos_16_las_tablas_del_registro_que_crecen_no_tienen_purga` (sonda de código, salida literal) | purgar `bitacora_plataforma` por antigüedad en el mismo ciclo de mantenimiento que ya llama a `purgar()`; `snapshot_metricas` es histórico y no debería purgarse, pero conviene decirlo en ESTADO |

Ningún hallazgo crítico ni alto. **No se encontró ningún camino por el que un
token de un cliente lea o escriba la base de otro**, ni ningún bypass de
autenticación.

---

## ingresos-1 — el oráculo de estado de cuenta vuelve con un token inventado (media)

**Qué pasa.** `clientes.py::cliente_del_pedido` hace:

```python
raw = _credencial(request)
if raw:
    slug = cliente_del_token(raw)   # None tanto si el token NO TRAE cliente
    ...                             # como si el token es BASURA (firma inválida)
solo = unico()
if solo is not None:
    if raw is not None:
        return _aplicar_estado(solo, request)   # <-- 402 acá
    return solo                                  # arreglo de R-1: sin credencial, sin estado
```

El arreglo de R-1 (`features/clientes/outputs/red-team-privilegio.md`) sólo
distingue "trajo credencial" de "no trajo". Un atacante anónimo que manda
`Authorization: Bearer no-soy-un-jwt` (o `?token=no-soy-un-jwt`) trae
"credencial", `cliente_del_token` devuelve `None`, se cae a `unico()` y
`_aplicar_estado` levanta 402 **antes** de que `require_auth` conteste su 401.

**Sonda, salida literal** (instalación de un cliente, `galerias`, mismo
`GET /api/spaces/`):

```
activo         anonimo=401  bearer-basura=401 {"detail":"Token inválido o expirado"}  ?token=basura=401
gracia         anonimo=401  bearer-basura=401 {"detail":"Token inválido o expirado"}  ?token=basura=401
solo_lectura   anonimo=401  bearer-basura=401 {"detail":"Token inválido o expirado"}  ?token=basura=401
suspendido     anonimo=401  bearer-basura=402 {"detail":"La cuenta de este cliente está suspendida."}  ?token=basura=402
```

Con `solo_lectura` el leak necesita un método que mute (el test lo hace con
`POST /api/suppliers/` y también devuelve 402).

**Impacto.** Cualquiera en internet, sin credencial de nadie, averigua si el
supermercado dejó de pagar — exactamente el oráculo que el login legado se
cuida de no construir (por eso un cliente inexistente contesta "Contraseña
incorrecta"). **Alcance acotado**: sólo aplica a la instalación con UN cliente
(el camino `unico()`); con dos o más, `unico()` devuelve `None` y sale 401.
Hoy producción es de un cliente, así que es explotable hoy.

**Arreglo propuesto (una línea de intención, sin relajar nada).** En
`cliente_del_pedido`, aplicar el estado sólo cuando la credencial **resolvió**
algo — p. ej. exigir que `cliente_del_token(raw)` haya devuelto un slug, o que
el token verifique la firma, antes de pasar por `_aplicar_estado` en la rama de
`unico()`. El 402 legítimo (usuario real de un cliente degradado) no cambia:
ese token sí verifica.

---

## ingresos-2 — `startswith` sin frontera de segmento en las exenciones (baja)

`clientes.py`:

```python
_EXENTOS_EN_SOLO_LECTURA = ("/api/auth", "/api/usuarios")
_EXENTOS_POR_HABEAS_DATA = ("/api/clientes/mi-export", ...)
...
if path.startswith(_EXENTOS_EN_SOLO_LECTURA): return cliente
```

Es literalmente el defecto que el hallazgo H-3 obligó a arreglar para
`/api/plataforma` (`_es_path_de_plataforma`, con frontera de segmento y su
propio comentario explicando por qué). Acá quedó sin arreglar: `/api/authX`,
`/api/authorizaciones/...`, `/api/usuariosX` heredarían la exención del
interruptor de cobranza. **Hoy no hay ninguna ruta así**, por eso es baja: es
defensa en profundidad, no un agujero abierto. El test lo demuestra llamando a
`_aplicar_estado` directo con `path="/api/authorizaciones/emitir"` en
`solo_lectura`: pasa en vez de dar 402.

---

## ingresos-3 — el `leeway` de 60 s también le alarga la vida al `exp` (baja)

`services/firebase_tokens.py` pasa `leeway=60` a `jwt.decode` para tolerar
desfase de reloj en `iat` (medido: 0,5 s bastaban para romper todo login). PyJWT
aplica el mismo `leeway` a `exp`. Medido:

```
exp hace 30 s  -> VERIFICA
exp hace 120 s -> rechaza
```

**Es defensa aceptable, no hallazgo alto**, y el propio comentario del código lo
dice: con TTL de 1 h, 60 s de más no cambia nada material, y el JWT propio que
sale del canje ya dura 12 h de todas formas. Se deja documentado para que quede
por escrito que se midió, no que se supuso.

---

## ingresos-4 — el alta disfraza una falla de infraestructura de "slug tomado" (baja)

`routers/alta.py` mapea **todo** `ErrorDeAlta` a `409 "Ese código ya está
tomado. Probá con otro."`. Pero `clientes.py::crear_cliente` levanta ese mismo
error cuando el `CREATE DATABASE` falla por permisos — el escenario probable en
Render, donde la base la crea el panel y el rol de la app no suele ser
superusuario. Salida literal del test:

```
alta con CREATE DATABASE denegado -> 409 {"detail":"Ese código ya está tomado. Probá con otro."}
```

El fundador prueba slugs para siempre, cada intento deja un `Usuario` huérfano
(R-4, confirmado por el mismo test) y nada en la respuesta dice qué pasó.
No es de seguridad; es de operación, y toca el camino de ingreso.

---

## ingresos-5 — tablas del registro que crecen sin purga (baja)

Sonda de código sobre `backend/app/`:

```
purga de audit_log: True | purga de bitacora_plataforma: False | purga de snapshot_metricas: False
```

`audit_log` se purga en el ciclo de mantenimiento (`services/bitacora.py::purgar`).
`bitacora_plataforma` gana una fila por CADA consulta de métricas / tendencia /
adopción (hit de caché incluido) y no se purga nunca. `snapshot_metricas` crece
una fila por cliente y mes: es histórico y probablemente *no* deba purgarse,
pero conviene que ESTADO lo diga en vez de que se descubra.

---

## Defensas que aguantaron (probadas, con test verde)

| test | qué se atacó | resultado |
|---|---|---|
| `test_ingresos_6_un_token_de_otro_proyecto_firebase_no_entra` | El JWKS de `securetoken` es **compartido por todos los proyectos Firebase**: se firmó un ID token con LA MISMA clave del JWKS (mismo `kid`, firma válida) pero con `aud`/`iss` del proyecto del atacante, y cada variante por separado (`aud` solo, `iss` solo, `iss` de `accounts.google.com`) | Los cuatro rechazados; el legítimo verifica (control) |
| `test_ingresos_7_ningun_router_cruza_de_cliente` | Cliente A y B con datos propios; barrido de 11 lecturas (`spaces`, `map`, `suppliers`, `layout`, `dashboard`, `mounts`, `catalogo`, `bitacora`, `files`, `notifications`) en las dos direcciones; y un claim `cliente` reescrito a mano sobre un token real | Cero fugas; el claim reescrito da 401 (la firma cubre `cliente`) |
| `test_ingresos_8_el_token_de_consola_no_abre_ninguna_base_de_negocio` | Token de operador (`cliente="plataforma"`) contra 8 rutas de negocio, por cabecera **y** por `?token=` (el camino lateral del `<img>`/`<iframe>`), más `/api/plataformazo` | 401 en las 16 combinaciones; el prefijo parecido no resuelve (H-3 sigue tapado) |
| `test_ingresos_9_el_freno_por_ip_no_se_esquiva_con_x_forwarded_for` | Envenenar `X-Forwarded-For` con una IP distinta por intento contra `/oauth` y `/clientes/alta` | 429 igual: `red.py::ip_del_cliente` lee la cadena de derecha a izquierda |
| `test_ingresos_10_la_invitacion_no_cruza_de_cliente_ni_sobrevive_al_vencimiento` | Canjear la invitación de A y pedir B con la misma cuenta; invitación vencida a mano | 403 y 403; membresías = `{galerias}` |
| `test_ingresos_11_...montaje...` | Token de montaje vencido, token de montaje **sin `cliente`** con dos clientes en el sistema, y token de montaje por la puerta general (`require_auth`) | 401, 401 y 401 — no se cae a un cliente arbitrario |
| `test_ingresos_12_sin_columnas_nuevas_en_tablas_preexistentes` | **SIN MIGRACIONES**: comparación por AST de `backend/app/models/` entre `6dd2f4c` y HEAD, tabla por tabla | Ninguna tabla preexistente ganó columnas en Fases 4–6; `snapshot_metricas` es tabla nueva |
| `test_ingresos_13_ninguna_credencial_valida_entra_a_un_cliente_inactivo` | Desactivar el cliente en el registro y volver por JWT, `?token=`, login legado y `/oauth` | 401 por los cuatro caminos, en el pedido siguiente |
| `test_ingresos_14_la_misma_clave_legada_en_dos_clientes_no_los_cruza` | Poner la MISMA contraseña de admin en dos clientes y entrar | Cada token nace con su propio `cliente`; sin `cliente` en el cuerpo, 422 |
| `test_ingresos_5_un_token_viejo_sin_cliente_no_se_cae_a_uno_arbitrario` | `unico()` como fallback: token firmado sin claim `cliente`, con DOS clientes | 401 en las 4 rutas — no elige uno arbitrario |
| `test_ingresos_4_h5_...` | H-5, caracterización: el admin de GALERIAS cambia la clave de SU `worker` | El token de consola del operador muere en el pedido siguiente (401). Se reproduce tal cual lo documenta ESTADO |

---

## Sospechas sin confirmar (sin reproducción — no son hallazgos)

1. **`X-Forwarded-For` detrás de Render.** `ip_del_cliente` es correcto *si* el
   proxy **agrega** su valor al final de la cadena. Si Render (o un CDN puesto
   adelante mañana) **reemplaza** la cabecera, o si hay dos saltos públicos, la
   "primera pública desde la derecha" puede no ser el cliente. No se puede
   medir sin producción, y atacar producción está prohibido. Verificable con un
   `curl` a un endpoint de eco desde una IP conocida.
2. **`crear_cliente` necesita permiso de `CREATE DATABASE` en el Postgres de
   Render.** Si el rol de la app no lo tiene, el alta self-service está
   *muerta en producción* y lo reporta como "slug tomado" (ver ingresos-4).
   No verificable localmente (los tests corren en SQLite, donde una base es un
   archivo).
3. **Un solo cliente en producción hoy.** `ingresos-1` depende de eso. Si ya
   hay dos o más clientes activos, el hallazgo deja de ser explotable — pero
   vuelve solo si alguna vez queda uno.
4. **Cache de membresía de 60 s entre procesos.** `_membresia_cache` es por
   proceso; con más de un worker de uvicorn, `invalidar_cache_membresia` sólo
   limpia el suyo y desactivar a alguien tardaría hasta 60 s en los demás. Hoy
   Render corre un worker (mismo supuesto que el caché de métricas de Fase 4),
   así que no se puede reproducir acá.
5. **El `?token=` en la query viaja a logs y `Referer`.** Es una decisión
   deliberada (`<img>`/`<iframe>` no mandan cabeceras) y está documentada, pero
   un JWT de 12 h en una URL es una superficie que crece con cada proxy nuevo.
   No hay reproducción posible: es riesgo, no bug.
6. **Concurrencia y `UNIQUE`.** No se atacaron las carreras de escritura
   (`find-or-create` de `spaces`/`suppliers`, 409 vs `UNIQUE`) por falta de
   territorio: se toca en la dimensión 5. R-3 (tope de fundaciones sin barrera
   en la base) ya está cubierto por `test_plataforma_ataques.py`.

---

## Veredicto honesto

**La frontera multi-tenant aguantó todo lo que le tiré.** Es la parte fuerte
del sistema y no por disciplina sino por construcción: el `cliente` va adentro
de lo firmado, `cliente_del_pedido` es el único punto donde se elige la base, y
un token de un cliente ni siquiera llega a tener sesión contra la de otro. El
barrido por 11 routers en las dos direcciones, el claim reescrito, el token de
consola por los dos caminos y el enlace de montaje sin cliente: todo cerrado.
La verificación de Firebase también está bien hecha — RS256 forzado desde el
header antes de tocar la red, clave por `kid` del JWKS de Google, y `aud`+`iss`
validados por parámetro, que es lo único que separa un proyecto Firebase de
otro cuando la clave de firma es compartida.

**Lo que encontré es todo de segundo orden**, y el único que merece arreglarse
es `ingresos-1`: el arreglo de R-1 se quedó a mitad de camino, y hoy —con un
solo cliente en producción— cualquiera averigua si ese supermercado dejó de
pagar mandando basura en el header. No da acceso a ningún dato: es una fuga de
información comercial de un bit. Media, no alta.

**Lo que NO auditó nadie acá y sigue abierto de fases anteriores**: la
invitación se canjea sólo por igualdad de correo (H-7, el token del enlace es
decorativo) y un cliente ajeno puede agregarse una membresía sobre la cuenta de
otro sin que esa persona lo consienta (xfail abierto en
`test_identidad_ataques.py`). No los repetí porque ya están demostrados y
marcados; siguen siendo, en mi lectura, lo más grave que arrastra la dimensión 1.
