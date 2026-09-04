# Fase 4 · Consola de Plataforma — legal (política de datos + ESTADO.md)

Territorio: `docs/legal/**`, `frontend/src/legal/**`, `docs/ESTADO.md`. No se
hizo commit ni push. No se tocó código ni otros tests.

## ⚠ Actualización — Iteración 2 (H-1/H-2): texto puesto, verificación de
## código INCOMPLETA — leer antes de mergear

Ejecuté el ajuste de iteración 2 tal como lo definió el Maestro: agregué al
5.3 la frase de supresión de celda chica (regla de los 3 contratos, H-2) y
reescribí la frase de top de proveedores para que describa el saneo de
correos/teléfonos (H-1), sin re-litigar la instrucción. **Pero antes de dar
esto por cerrado hay un hecho que el Maestro debe conocer:**

Al momento de correr esta iteración, **el código NO tiene el arreglo de H-1
ni de H-2**. Verificado directamente en el repo, no en un reporte:

- `backend/app/plataforma_metricas.py` no tiene ningún umbral (`UMBRAL`,
  `>= 3`, `len(contratos) <`, etc.) ni ninguna función de saneo de nombre
  (no hay `@`, `mask`, `enmascar`, `regex` sobre `Supplier.name` en todo el
  archivo). `_top()` sigue devolviendo `conteos.items()` con el nombre tal
  cual llegó de la base, y `canon_promedio_mensual` / `ingreso_contratado_mes`
  se calculan sin mirar cuántos contratos los componen.
- `backend/tests/test_metricas_ataques.py` sigue teniendo
  `test_m29_hallazgo_un_proveedor_con_correo_en_el_nombre_filtra_el_correo`
  y `test_m30_hallazgo_celda_de_uno_el_agregado_es_el_valor_individual`
  marcados `@pytest.mark.xfail(strict=True, reason="H-1: …")` /
  `xfail(strict=True, reason="H-2: …")` — es decir, **siguen siendo
  hallazgos abiertos, no arreglos verificados**. Si el código ya tuviera el
  arreglo, esos dos tests estarían en XPASS y la suite estaría en rojo
  (`strict=True` está puesto exactamente para eso).
- `backend/app/models/plataforma.py`, `plataforma_estado.py` y
  `routers/plataforma.py` (fuera de mi territorio, los miré solo para
  buscar el arreglo) tampoco tienen el umbral ni el saneo.
- `features/plataforma/outputs/backend-metricas.md` (el entregable del
  builder de backend) es de **antes** de que el red team encontrara H-1/H-2
  — no lo confirma ni lo contradice, simplemente no lo menciona todavía.

**Consecuencia:** el ajuste que me pidieron ejecutar dice, correctamente,
"el código se corrigió para que el 5.3 sea cierto — vos documentás eso".
Hice la parte que me corresponde (el texto, byte a byte en las dos copias,
verificado). Lo que **no puedo hacer desde mi territorio** es hacer que esa
premisa sea cierta: no toco código. Si el builder de backend todavía no
corrió su iteración 2 cuando esto se lea, el 5.3 de la política —tal como
queda después de este cambio— **describe un comportamiento que el sistema
todavía no tiene**, que es exactamente el escenario que la decisión del
Maestro dice que hay que evitar ("no se reescribe la política para
legalizar la fuga"). No re-litigo la decisión de versión (sigue siendo NO
subir, ver más abajo); lo que marco es que su condición —que dejó el propio
red team— hay que verificarla en `plataforma_metricas.py` y en
`test_metricas_ataques.py` (los dos `xfail` deben pasar a estar ausentes o
a XPASS-y-removidos) antes de publicar la política o de cerrar la fase.
Dejo esto también en `docs/ESTADO.md`, dentro del punto de la decisión de
versión, con la misma referencia a los tests.

## 1. Punto nuevo en la Política de Tratamiento de Datos

Se agregó el **punto 5.3** (dentro de la sección 5 "Rol dual: quién responde
por qué datos", justo después de 5.2 "El supermercado cliente como
RESPONSABLE y RECABRA como ENCARGADO") en `docs/legal/politica-datos.md`.
Se eligió esa ubicación —y no una sección nueva al final— porque el punto es,
literalmente, una precisión sobre el reparto de responsabilidades que ya
describe la sección 5: aclara que la relación operador↔plataforma no reabre
ni contradice el reparto responsable/encargado de 5.2, sino que describe una
capacidad interna de operación distinta.

También se agregó una frase de referencia cruzada en el párrafo existente de
5.2 ("ser operador de la plataforma no abre la base de negocio de ningún
cliente") para que no quede una afirmación absoluta contradicha dos párrafos
después por el punto nuevo — sin tocar la lista taxativa de la spec ni
reargumentar la enmienda, solo evitando que el propio documento se
contradiga.

**Texto del punto 5.3** (ver el archivo para el texto completo con formato):
declara que el operador de la plataforma ve métricas agregadas del negocio
de cada supermercado cliente — conteos, porcentajes de ocupación, promedios
y sumas de canon, top de proveedores por nombre comercial y conteo de
contratos, cantidad de usuarios con cuenta y fecha del último acceso sin
identidad —, que son **solo lectura**, **nunca filas individuales** ni datos
de personas identificadas, que el sistema las construye por consulta
agregada (nunca exponiendo listas de filas), y que cada consulta queda
anotada con el correo del operador, cuándo y qué período. Todo el punto está
marcado **`[VALIDAR CON ABOGADO]`** — con un segundo callout interno que le
pide al abogado confirmar específicamente que estos agregados no son dato
personal bajo el artículo 3 de la Ley 1581, y que si concluye lo contrario
el camino previsto es subir `VERSION_POLITICA`.

Replicado **byte a byte** a `frontend/src/legal/politica-datos.md` (copia
completa del archivo, no edición paralela — así no hay forma de que diverjan
un espacio o un salto de línea).

**Verificación:**
```
$ diff -q docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
COPIAS IDENTICAS

$ rm -f backend/retail_espacios.db backend/recabra_*.db
$ cd backend && python -m pytest -k politica -q
..................                                                       [100%]
18 passed
```
(incluye `test_x21_los_tres_documentos_legales_dicen_que_son_borrador`, que
fija la copia byte a byte con `politica.read_bytes() == copia.read_bytes()`.)

## 1.bis Iteración 2: H-1/H-2 reflejados en el 5.3

Sobre ese mismo punto 5.3, sin tocar su ubicación ni el resto del documento:

- **[H-2] Supresión de celda chica.** Nuevo párrafo que declara, en lenguaje
  de política: los promedios y sumas de canon, y el top de proveedores, de
  un cliente **solo se muestran cuando agrupan al menos 3 contratos activos
  del período**; por debajo, el dato se omite. Se explica el porqué (un
  agregado de 1 o 2 contratos equivale, en la práctica, al canon de un
  contrato puntual e identificable) para que quede claro que la regla no es
  arbitraria sino la razón de ser del punto.
- **[H-1] Top de proveedores, redactado como lo implementado.** La frase
  pasó de "nombre comercial y número de contratos activos" a "**nombre
  comercial del proveedor —depurado de datos de contacto: los correos y
  teléfonos que pudieran aparecer se enmascaran antes de mostrarse— y
  conteo de contratos activos**". No promete más de lo que el mecanismo
  hace: dice explícitamente que lo que se enmascara es correo y teléfono,
  no que el nombre completo del proveedor desaparezca.
- **Callout `[VALIDAR CON ABOGADO]` ampliado** con la pregunta del contador:
  un nombre comercial puede coincidir con el nombre de una persona natural
  (proveedor unipersonal que factura a su propio nombre) aun después del
  saneo de correo/teléfono; le pido al abogado que evalúe ese escenario
  puntual bajo el artículo 3 de la Ley 1581 y qué tratamiento adicional
  correspondería si aplica.

**Ver la advertencia al principio de este archivo** ("Actualización —
Iteración 2… verificación de código INCOMPLETA"): el texto de arriba
describe el comportamiento que el 5.3 declara que el sistema tiene. Al
correr esta iteración, no pude confirmar en el código
(`backend/app/plataforma_metricas.py`) que la regla de los 3 contratos y el
saneo de nombre estén implementados — los tests que el propio red team
escribió para probarlos (`test_m29_…`, `test_m30_…` en
`test_metricas_ataques.py`) siguen marcados `xfail(strict=True)`, que es la
marca de "esto todavía NO pasa". Dejo el texto puesto porque es lo que el
Maestro pidió documentar y porque describe el compromiso de diseño acordado,
pero el compromiso de este documento con la realidad del código queda
pendiente de que alguien (backend o el Conciliador) confirme que esos dos
`xfail` se removieron.

## 2. Decisión de versión: `VERSION_POLITICA` NO se sube (condicionada, iteración 2)

Documentado (no re-litigado — la decisión la falló el Maestro/orquestador):
`VERSION_POLITICA` se mantiene en `"2026-09-v1"`. No se toca
`backend/app/models/consentimiento.py` (fuera de mi territorio, y además la
decisión es justamente no cambiar la constante).

**Cambio de framing en esta iteración**, tal como me lo pidió el Maestro: en
la iteración 1 la conclusión era "no subir" de forma incondicional (los
agregados no son dato personal por diseño, punto). En la iteración 2 la
conclusión pasa a ser **"no subir, porque la condición que el propio red
team fijó para eso quedó satisfecha"**: el red team (`red-team-metricas.md`)
encontró que, SIN la regla de los 3 contratos (H-2) y SIN el saneo de
nombre de proveedor (H-1), los agregados podían dejar de serlo — un
agregado de un solo contrato ES el contrato, y un nombre de proveedor con
un correo adentro filtra ese correo. Esos dos hallazgos son precisamente el
tipo de cosa que, de quedar sin corregir, movería la balanza hacia "sí hay
que subir versión" (agregados que en los hechos identifican a alguien). Con
la regla de los 3 contratos y el saneo de nombre puestos, esa condición
queda satisfecha y la conclusión "no subir" se sostiene — **sujeto a la
advertencia del principio de este documento**: no pude confirmar desde mi
territorio que esos dos arreglos estén efectivamente en
`backend/app/plataforma_metricas.py` (los tests `test_m29_…` / `test_m30_…`
de `test_metricas_ataques.py` siguen `xfail(strict=True)` a la fecha de esta
iteración). Cito esos dos tests explícitamente porque son la fuente de
verdad de si la condición se cumplió o no: cuando dejen de estar marcados
`xfail` (o el archivo confirme que ya no existen porque el hallazgo se
cerró), la condición queda verificada sin ambigüedad.

**Justificación completa** (reflejada dentro del `[VALIDAR CON ABOGADO]` del
punto 5.3, para que quien audite la política vea el razonamiento sin tener
que ir a buscarlo a otro documento):

1. **Los agregados no son datos personales por construcción.** La Ley 1581
   (artículo 3) define dato personal como el vinculable a una persona natural
   determinada o determinable. Lo que ve el operador es: números (conteos,
   porcentajes, promedios, sumas), el **nombre comercial** de un proveedor
   junto a un conteo de contratos (no el nombre de la persona de contacto,
   no su teléfono ni correo — eso está explícitamente excluido por la spec y
   por el contrato JSON), y una **fecha** de último acceso sin identidad
   adjunta. Ninguno de estos campos, ni combinados entre sí, identifica a una
   persona natural determinada o determinable. No hay tratamiento nuevo de
   datos de un titular: el titular (usuario de la plataforma, contacto de
   proveedor, personal del supermercado) no aparece en ningún campo de la
   respuesta.
2. **Lo que cambia es la relación RECABRA↔empresa cliente, no
   titular↔responsable.** El consentimiento que un usuario acepta en el alta,
   en una invitación o al ingresar versa sobre qué hace RECABRA con SUS
   datos personales (sección 4 de la política). La consola de plataforma no
   agrega ningún tratamiento nuevo de esos datos: agrega una función de
   negocio (que el dueño del SaaS entienda su propio negocio), operada sobre
   una superficie de agregados que por diseño no contiene datos personales
   de ningún titular. El consentimiento del titular no versa sobre esa
   relación de negocio.
3. **La política sigue siendo BORRADOR.** El encabezado y el cierre del
   documento (líneas 1 y 543-545 antes del cambio) dicen explícitamente que
   tiene `[COMPLETAR]` sin resolver y no está lista para publicar. Disparar
   el flujo de re-consentimiento (el 428 `consentimiento_requerido` a
   canjes nuevos, el aviso a toda la base existente) por una aclaración
   agregada a un documento que todavía no se publicó no corresponde: el
   costo operativo (interrumpir a toda la base de usuarios) no tiene
   contrapartida, porque no hubo tratamiento nuevo de sus datos.

**Camino previsto si el abogado opina distinto** (dejado dicho dentro del
`[VALIDAR CON ABOGADO]` del punto 5.3, y repetido en `docs/ESTADO.md`): subir
`VERSION_POLITICA` es un cambio de una constante (`backend/app/models/
consentimiento.py`) + el encabezado de los dos archivos de política, y el
flujo de re-consentimiento automático (`POST /api/auth/aceptar-politica`,
`pedir_consentimiento: true` top-level, el 428 en canjes que crean membresía
nueva) ya existe de la Fase 3 y no necesita construirse — solo activarse por
la versión nueva. No es una decisión que requiera código adicional.

## 3. `docs/ESTADO.md`

**(a) Enmienda de la regla de Fase 2** (sección "Clientes comerciales: alta
self-service y estado de cuenta (Fase 2)", párrafo "Operadores de
plataforma"): se reemplazó la frase "Ser operador NO abre la base de negocio
de ningún cliente." por el texto EXACTO de la spec:

> "El operador accede a datos de negocio de los clientes SOLO a través de
> los endpoints de métricas agregadas definidos en esta spec: solo lectura,
> solo agregados (nunca filas individuales), y cada consulta queda anotada
> en la bitácora del registro con el email del operador. Ningún otro
> endpoint de plataforma abre una base de cliente."

con la marca "**Enmendado en Fase 4** (ver esa sección más abajo)" antes de
la cita, para que quede rastro de que es una enmienda de Fase 4 y no una
regla original de Fase 2 reescrita en silencio.

**(b) Sección nueva "Fase 4 — Consola de plataforma"**, agregada dentro de
"## Qué está hecho", inmediatamente después de la subsección de Compliance
(Fase 3) y antes de "### Pendientes conocidos: clientes y plataforma" —
mismo lugar temático que las fases anteriores. Resume:

- Ruta `/plataforma` (página completa, sin Topbar de sede; el modal
  `PlataformaPanel` murió y se mudó a la página).
- `GET /api/plataforma/metricas`: agregados taxativos de la spec, cache de
  5 min **en memoria del proceso**, tabla nueva del registro
  `bitacora_plataforma` (sin migración), bases de cliente read-only en
  secuencia y tolerantes a fallos (patrón `_run_lease_maintenance`).
- La enmienda de la regla del operador (con referencia cruzada a la nota de
  Fase 2) y las garantías de frontera del JSON (nunca filas, nunca
  correos/nombres de usuarios finales; un cliente suspendido también
  aparece).
- Token de operador sin membresías con `cliente="plataforma"` (slug
  reservado), que solo resuelve bajo `/api/plataforma/*` y da 401 en
  cualquier otro path por construcción.
- Guardrails: sin migraciones, login legado y JWT intocados, rutas literales
  antes de paramétricas.
- **Pendientes conocidos de la fase**: cache por proceso (>1 worker de
  uvicorn implicaría un cálculo por proceso — hoy Render corre uno); época
  del token plataforma atada a la base por defecto (la de GALERIAS); campo
  `ultimo_acceso` solo se mueve con `/oauth` (el login legado no lo
  actualiza); y la decisión de NO subir `VERSION_POLITICA`, pendiente de
  confirmación del abogado, con referencia al punto 5.3 de la política.

No se tocó ninguna otra sección de `docs/ESTADO.md` (Reglas duras, las
secciones de diseño/UI, la narrativa de seguridad histórica de más abajo,
etc.) — el cambio quedó acotado a las dos secciones donde la spec pide la
enmienda y el resumen de fase.

### (c) Iteración 2 — lo que se agregó a la sección "Fase 4" de ESTADO.md

- El párrafo del endpoint `GET /api/plataforma/metricas` ahora incluye la
  regla de los 3 contratos (supresión de celda chica, H-2) y el saneo de
  nombre de proveedor (correos/teléfonos enmascarados, H-1), en la misma
  frase donde ya se resumían los campos taxativos.
- Dos entradas nuevas en "Pendientes conocidos de la fase":
  - **H-5** (`test_m33_…`), citado explícitamente: el admin del cliente que
    vive en la base por defecto puede cerrarle la sesión al operador
    cambiando su propia contraseña de `worker` — aceptado a conciencia,
    efecto máximo un re-login.
  - **M-1 / H-6** (`test_m34_…`), citado explícitamente: el cache de
    métricas de 5 min no se invalida cuando cambia el `estado_cuenta` de un
    cliente por `PATCH`, así que el panel puede mostrar un estado viejo
    hasta 5 minutos. Marcado **mayor**, con el arreglo (llamar
    `limpiar_cache_metricas()` desde el `PATCH` de estado) explícitamente
    diferido a la fase siguiente. El texto aclara que el test que lo
    documenta hoy NO está en `xfail` (documenta la conducta aceptada, no
    una promesa incumplida) — distinto de H-1/H-2, cuyos tests SÍ siguen en
    `xfail(strict=True)` porque esos dos son hallazgos sin cerrar (ver la
    advertencia al principio de este archivo).
- El párrafo de la decisión de versión se reescribió para explicar que el
  "no subir" ahora es **condicional a que H-1/H-2 estén realmente
  corregidos**, no una conclusión de una sola vez — con la misma cita a
  `test_m29_…` / `test_m30_…` que uso en este archivo, para que quien lea
  `docs/ESTADO.md` sepa exactamente qué mirar para confirmar la condición.

## Coordinación con otros builders

Al momento de correr, `features/plataforma/outputs/frontend-consola.md` y
`features/plataforma/outputs/maestro-plan-fase-4.md` ya existían;
`backend-metricas.md` todavía no. Se incorporó de esos dos documentos lo que
altera el texto de ESTADO.md: el contrato exacto de
`GET /api/plataforma/metricas` (campos, semántica de `ocupacion_pct`,
`canon_promedio_mensual`, `top_proveedores`, `usuarios_con_cuenta`,
`ultimo_acceso`), el nombre de la tabla nueva `bitacora_plataforma`, el
mecanismo del token `cliente="plataforma"` y sus invariantes (solo bajo
`/api/plataforma/*`, 401 en el resto por construcción, validación de
`es_operador(email)` en `decode_token`), y los tres pendientes conocidos
(cache por proceso, época atada a la base por defecto, `ultimo_acceso` solo
vía `/oauth`) — todos ya fijados textualmente en el plan del Maestro
(`maestro-plan-fase-4.md`, secciones 2.1-2.3 y 4), así que no quedó ningún
TODO pendiente de otro builder en mi entregable.

## Archivos tocados

- `docs/legal/politica-datos.md` — punto 5.3 nuevo + referencia cruzada en
  5.2.
- `frontend/src/legal/politica-datos.md` — copia byte a byte del anterior.
- `docs/ESTADO.md` — enmienda de la frase de Fase 2 + sección nueva
  "Fase 4 — Consola de plataforma".

## Verificación final (iteración 2, TMPDIR propio)

```
$ diff -q docs/legal/politica-datos.md frontend/src/legal/politica-datos.md
COPIAS IDENTICAS

$ export TMPDIR=<directorio propio de esta corrida>
$ rm -f backend/retail_espacios.db backend/recabra_*.db
$ cd backend && python -m pytest -q -k politica
..................                                                       [100%]
18 passed
```

18/18, sin fallas. No se corrió la suite completa (`python -m pytest -q`)
desde este builder: el territorio es exclusivamente documentos, y tocar la
suite entera invita a confundir regresiones ajenas (backend/frontend en
curso en paralelo) con este cambio. La verificación de cierre de la suite
completa le corresponde al Conciliador, según el plan del Maestro.

**Verificación que SÍ hice y que no estaba en el pedido, porque el pedido
la presupone cierta**: busqué en el código el arreglo de H-1/H-2 antes de
escribir el texto que lo describe, para no declarar en la política algo que
el sistema no hace. No lo encontré — ver la advertencia al principio de
este archivo. Dejo la tarea de política **hecha** (el texto es correcto
como declaración del diseño acordado) pero **no la doy por cerrada para
publicación** hasta que alguien confirme, mirando
`backend/app/plataforma_metricas.py` y corriendo
`test_metricas_ataques.py -k "m29 or m30"`, que H-1 y H-2 ya no son
`xfail`.
