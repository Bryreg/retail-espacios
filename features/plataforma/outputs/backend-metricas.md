# Fase 4 — Backend de agregados y puerta del operador

Entregable del builder «Backend de Agregados y Puerta del Operador».
Rama `claude/fase-4-plataforma`. Sin commit ni push.

## Qué se construyó

**A) `GET /api/plataforma/metricas?periodo=YYYY-MM`** — consolidado + una fila
por cliente con los agregados taxativos de la spec. Lógica entera en el módulo
nuevo `backend/app/plataforma_metricas.py`, que **sólo lee**; el endpoint vive
en `backend/app/routers/plataforma.py`, declarado como ruta LITERAL antes de
`/clientes/{slug}` y de `/supresiones/{solicitud_id}`.

**B) Bifurcación de `/oauth` para el operador SIN membresías** — token de la
consola (`cliente: "plataforma"`), que abre `/api/plataforma` y **nada más**.

### Archivos tocados (todos dentro del territorio asignado)

| Archivo | Qué cambió |
|---|---|
| `backend/app/plataforma_metricas.py` | **NUEVO.** Todo el cálculo, el caché y la semántica de layout replicada server-side. |
| `backend/app/models/plataforma.py` | **NUEVO modelo** `BitacoraPlataforma` (tabla `bitacora_plataforma` del registro). |
| `backend/app/routers/plataforma.py` | Endpoint `GET /metricas` + escritura de la bitácora. Docstring del módulo actualizado con la excepción. |
| `backend/app/plataforma_estado.py` | Constantes de contrato `SLUG_PLATAFORMA` / `NOMBRE_PLATAFORMA`. |
| `backend/app/auth.py` | `decode_token`: el slug `plataforma` valida contra `es_operador`, no contra `_membresia_activa`. |
| `backend/app/clientes.py` | `cliente_del_pedido`: `plataforma` resuelve a un `Cliente` sintético **sólo** bajo `/api/plataforma`; 401 en cualquier otro path. |
| `backend/app/routers/auth.py` | `/oauth`: operador sin membresías → 200 con token de consola (`_entrar_a_la_consola`). |
| `backend/tests/test_plataforma_metricas.py` | **NUEVO.** 40 pruebas (29 de la primera iteración + 11 de las tres correcciones). |

**Sin migraciones**: la única tabla nueva es del registro y la crea
`create_all()`, igual que `estados_cliente` y las de identidad. Ni una columna
nueva en ninguna tabla existente.

---

## El contrato JSON, campo por campo

Se implementó **literal**, sin un campo de más ni de menos. Los únicos arreglos
de toda la respuesta son `clientes` y `top_proveedores`, y hay una prueba que
recorre el JSON real y lo verifica
(`test_los_unicos_arreglos_son_clientes_y_top_proveedores`), más otra que
comprueba que no aparece ninguna clave de la lista prohibida ni ningún correo
de usuario final (`test_el_json_no_trae_ninguna_clave_prohibida`).

### Decisiones de semántica (y por qué)

| Regla | Cómo quedó |
|---|---|
| **Período** | `?periodo=YYYY-MM`; sin parámetro, el mes calendario en curso **en UTC** (el servidor fecha en UTC en todo el repo; usar la hora local haría que «el mes actual» dependiera de dónde se despliegue). Malformado → 422, nunca un silencioso «te doy el mes actual». |
| **Contrato activo** | `start_date <= hasta AND end_date >= desde`, ambos extremos inclusive. Un contrato de UN día que cae adentro del mes cuenta. |
| **`espacios_comercializables`** | Caras vendibles del JSON de `layout_snapshots`. `rentable` ausente = comercializable; **sólo un `false` explícito** excluye (espeja `isRentable`). Góndola doble = **dos** caras SIEMPRE (`SEDE-CODE` y `SEDE-CODE-B`), con o sin la clave `faceB` — ver «Corrección b-1» abajo. Es doble si `type == "gondola"` con `gondolaType` ausente o `"double"`, **o** si el tipo es el legado `"gondola_doble"`. Códigos completos en mayúsculas, sin doble prefijo (espeja `fullSpaceCode`). Se juntan en un `set`, así que dos sedes que repitan nomenclatura corta no se pisan (el código completo las distingue) y un mismo código repetido dentro de una sede no cuenta dos veces. |
| **`sedes_con_plano`** | Filas de `layout_snapshots` con **al menos un mueble**. Una sede cuyo plano se guardó vacío no es una sede con plano: la fila existe desde que alguien abrió el editor y guardó sin dibujar nada. Un `fixtures_json` ilegible tampoco cuenta, y no tumba al cliente. |
| **`ocupacion_pct`** | caras comercializables con contrato activo / comercializables × 100, un decimal. `null` si el denominador es 0 (un cliente sin espacios no tiene 0 % de ocupación: no tiene ocupación). |
| **Contrato sobre espacio sin mueble** | NO cuenta para ocupación —inflaría un numerador contra un denominador que no lo incluye y el porcentaje podría pasar de 100— pero **sí** para canon, ingreso y top de proveedores: la plata existe aunque el plano no la muestre. Probado con `FANTASMA-01`. |
| **`canon_promedio_mensual`** | Promedio de `monthly_rent` de los contratos activos; `null` si no hay ninguno **y `null` también por debajo de K=3** (ver «Supresión de celda chica»). En el consolidado es **PONDERADO**: Σ canones / Σ contratos de los clientes legibles. Nunca promedio de promedios. |
| **`ocupacion_pct` consolidada** | Σ ocupadas / Σ comercializables, por la misma razón. |
| **`ingreso_contratado_mes`** | Σ `monthly_rent`, sin prorrateo. **`null` por debajo de K=3 contratos activos** — y como 0 contratos también está por debajo del umbral, un cliente sin contratos da `null` (antes daba `0.0`). |
| **`top_proveedores`** | Máximo 5, descendente por nº de contratos activos, empates alfabéticos por nombre. Cada objeto es EXACTAMENTE `{nombre, contratos_activos}`. El `nombre` sale **saneado** (correos/teléfonos enmascarados, tope de 80 caracteres); el conteo y el orden se hacen sobre el nombre original. **Lista vacía por debajo de K=3.** |
| **`usuarios_con_cuenta`** | Usuarios distintos con membresía **activa** del cliente, leída de `membresias` del **REGISTRO** (identidad global desde la Fase 1), nunca de la base del cliente. En el consolidado, distintos **entre todos** los clientes legibles: la misma persona con cuenta en dos supermercados no son dos usuarios de la plataforma. |
| **`ultimo_acceso`** | `YYYY-MM-DD` del `ultimo_login` más reciente de esos usuarios; `null` si nadie entró. **Sin hora y sin identidad** — la fecha, no quién ni a qué hora. Sólo por cliente; el consolidado no lo lleva. |
| **`estado_cuenta`** | Misma regla que `GET /plataforma/clientes`: fila ausente en `estados_cliente` = `"activo"`. Un cliente **suspendido aparece igual**, con todas sus métricas. |
| **`clientes_total` / `clientes_con_error`** | `clientes_total` = filas de `clientes` (activas e inactivas). El consolidado **excluye** a los clientes con error y los cuenta aparte. Sumarlos como si fueran clientes en cero mentiría el porcentaje. |

---

## Iteración 2 — tres correcciones sobre `plataforma_metricas.py`

Las tres salen de las auditorías de la fase y las tres cambian el **contrato
observable**, así que van declaradas acá antes que nada.

### Corrección b-1 (+ m-1): una góndola doble son dos caras, siempre

**Qué decía este documento antes**, y estaba **mal**: «góndola doble con
`faceB` presente = dos caras». Lo daba por intencional. No lo es.

`faceB` es **dónde se guardan los datos comerciales de la cara B**, no lo que
hace doble a una góndola. El editor 3D omite la clave mientras esa cara nunca
tuvo nada vendido, que es el estado normal de una góndola recién dibujada.
`facesOf` (`frontend/src/pages/DashboardView.tsx:148`) hace `f.faceB ??
EMPTY_FACE` y devuelve **dos** entradas siempre. El criterio viejo contaba la
mitad del inventario justo en el mueble más común y en su estado más frecuente:
un cliente con el plano recién cargado aparecía con la mitad de los espacios y
el doble de ocupación.

`_caras_comercializables` ahora suma la cara B cada vez que `_es_gondola_doble`
da verdadero, con o sin `faceB`. En la misma pasada, `_es_gondola_doble`
reconoce también el tipo **legado** `"gondola_doble"` (hallazgo m-1): es la
misma función y el mismo criterio, y `DashboardView.tsx:131` conserva a
propósito `|| f.type === "gondola_doble"` porque esos layouts están persistidos
en las bases de los clientes viejos.

Caso testigo: góndola doble sin `faceB` → `espacios_comercializables: 2`; un
contrato sobre la cara B → `ocupacion_pct: 50.0`.

### Corrección H-1: el nombre del proveedor se sanea antes de salir

`Supplier.name` es **texto libre que teclea el supermercado** y es el único
string de negocio que la spec deja cruzar al JSON del operador. En retail el
proveedor es muy seguido una persona natural y el contacto termina escrito
adentro del nombre, porque es el campo que se ve en las listas:
`"Juan Perez Distribuciones (juan.perez@gmail.example)"` salía **verbatim**.
La frontera decía «números y el top de proveedores» y de hecho publicaba un
dato personal de un tercero.

`sanear_nombre_proveedor` hace tres pasadas, en este orden:

1. **Correos** — toda subcadena con forma de correo (`@` más un punto en el
   dominio) → `[correo oculto]`. Va primero porque un correo suele traer
   dígitos que si no se llevaría la pasada siguiente.
2. **Teléfonos** — 7 o más dígitos contiguos admitiendo espacios, guiones,
   puntos y paréntesis intercalados → `[teléfono oculto]`. El umbral es 7
   porque abajo de eso son códigos internos o años, no un contacto.
3. **Tope de largo** — 80 caracteres, cortando en el último espacio para no
   partir una palabra, con `…` al final.

Como defensa extra, un `@` suelto que sobreviva a la pasada 1
(`"Distribuciones @ Norte"`) se neutraliza igual: la invariante que se defiende
es «ningún string del JSON trae una arroba», y depender de que el patrón cubra
todas las formas de escribir un correo es apostar contra el usuario.

**Dónde se aplica**: en `_top`, al armar cada objeto que sale — por cliente y
en el consolidado. El **conteo y el agrupamiento se hacen sobre el nombre
ORIGINAL**, y el orden (conteo desc, alfabético para los empates) también. Si
se agrupara por la versión saneada, dos proveedores distintos que enmascaran
igual se fundirían en una fila y el conteo mentiría; y dos filas del mismo
proveedor no se separan por el saneo.

### Corrección H-2: supresión de celda chica, K=3

Una suma de un solo sumando no es un agregado: **es el sumando**. Con un
contrato activo, `ingreso_contratado_mes` y `canon_promedio_mensual` eran,
exactamente, el `monthly_rent` de ese contrato, y el `top_proveedores` de al
lado decía con quién se firmó — el operador reconstruía la fila entera
(proveedor, monto y, si además había una sola cara ocupada, cuál espacio) sin
salir del panel. Es lo que la spec prohíbe («nunca valores de contratos
individuales»), y no es un caso de laboratorio: es el estado normal de un
supermercado en su primer mes, que es cuando más se lo mira desde la consola.

**La regla**: si el cliente tiene **menos de 3** contratos activos en el
período, esa fila publica

* `ingreso_contratado_mes: null`
* `canon_promedio_mensual: null`
* `top_proveedores: []`

K=3 y no 2 porque con dos contratos quien conoce uno despeja el otro restando.

**El umbral incluye el cero**, y no es un descuido. La tentación era dejar
`0.0` cuando el cliente no tiene ningún contrato —no hay nada que proteger si
no hay ningún contrato— pero eso rompe la supresión por la puerta de atrás: si
el cero se publica y el 1 y el 2 se ocultan, entonces `null` **significa**
«tiene uno o dos», y el operador aprende de la ausencia lo que la regla le
quería ocultar. Es la fuga secundaria clásica de la supresión de celdas. Con el
umbral uniforme, `null` sólo dice «menos de tres», que es lo que la regla
promete.

**`null` vs `[]`, y por qué la mezcla es consistente**: los dos importes ya
usaban `null` para «este número no existe» (`canon_promedio_mensual` sin
contratos), así que suprimir es un caso más de lo mismo. `top_proveedores`, en
cambio, es un arreglo en todos los demás casos y el frontend lo recorre sin
preguntar: devolverle `null` lo rompería para ganar una distinción que no
necesita. **Ningún tipo nuevo entra al contrato.**

**El consolidado**: se calcula con los datos **subyacentes completos** de todos
los clientes legibles —las filas suprimidas incluidas: suprimir una fila no
puede cambiar el total del negocio— y aplica **la misma regla a su propio
nivel**: si Σ contratos activos del período es menor que 3, esos tres campos
del consolidado también salen suprimidos.

**Consecuencia declarada, por diseño**: cuando hay filas suprimidas, el
consolidado **ya no es reconstruible sumando las filas visibles**. Eso no es un
efecto colateral, es lo que hace que la supresión sirva: si el total cuadrara
con lo publicado, la fila oculta se despejaría restando. Hay un test que lo
fija (`test_el_consolidado_se_calcula_con_los_datos_subyacentes_de_las_filas_suprimidas`).

Cómo se ve una fila suprimida en el contrato (todo lo demás, idéntico):

```json
{
  "slug": "nuevo", "nombre": "Nuevo", "estado_cuenta": "activo", "error": null,
  "metricas": {
    "sedes_con_plano": 1,
    "espacios_comercializables": 12,
    "ocupacion_pct": 8.3,
    "canon_promedio_mensual": null,     // < 3 contratos activos: suprimido
    "ingreso_contratado_mes": null,     // < 3 contratos activos: suprimido
    "top_proveedores": [],              // < 3 contratos activos: suprimido
    "usuarios_con_cuenta": 3,
    "ultimo_acceso": "2026-09-03"
  }
}
```

**Qué NO toca**: `ocupacion_pct`, `sedes_con_plano`,
`espacios_comercializables`, `usuarios_con_cuenta`, `ultimo_acceso`,
`clientes_total` y `clientes_con_error` siguen publicándose siempre. Un
porcentaje sobre el inventario no revela ningún valor de contrato, y taparlo
dejaría al panel sin la métrica que justifica la fase.

---

## Un desvío, declarado: `is_active`

El contrato define «contrato activo en el período» por el solapamiento de
fechas. La implementación le suma `SpaceLease.is_active == True`.

**Por qué**: esa bandera no es otra ventana de tiempo, es lo que dice que el
contrato **no fue cancelado**. El propio modelo lo documenta
(`Space.active_lease` en `models/models.py`: «las fechas son la verdad; la
bandera sólo dice que el contrato no se dio de baja») y el archivado de una sede
la baja a `False` justamente para que ese contrato deje de contar. Sin este
filtro, un contrato cancelado en septiembre seguiría sumando ingreso y ocupación
en el panel del operador, y un espacio archivado seguiría figurando ocupado.
Cubierto por `NAVE-GON-01` en los datos sembrados (contrato con fechas dentro
del mes e `is_active = False`, que no aparece en ningún agregado).

---

## Cómo se recorren las bases (y por qué así)

Patrón `main.py::_run_lease_maintenance`, calcado:

* **En secuencia**, un cliente por vez. Nada de hilos: N bases en paralelo
  contra un pool de Postgres de plan Basic es exactamente la forma de tumbar el
  servicio con el panel del operador.
* **`try/except` por cliente**: una base rota deja su fila con
  `error: "No se pudo leer la base de este cliente."` y `metricas: null`, y el
  resto del panel sigue. El consolidado la excluye.
* **Sesión con `sesion_de()`, cerrada en `finally`.**
* **Sólo lectura, por construcción**: en todo `plataforma_metricas.py` no hay
  un solo `add`, `commit`, `delete` ni `flush` contra una base de cliente. Las
  sesiones de cliente sólo hacen `query(...)`. Hay una prueba que fotografía
  `spaces`, `space_leases` y `audit_log` de un cliente antes y después de dos
  consultas y verifica que no se movió nada
  (`test_las_metricas_no_escriben_en_la_base_del_cliente`).
* **`AuditEntry` no se toca**, ni para leer ni para escribir. La constancia del
  acceso del operador va a `bitacora_plataforma`, en el registro.

### El texto del error

Es **fijo** y corto. La prueba
`test_el_error_no_filtra_la_base_ni_el_mensaje_del_driver` verifica que no
contiene `sqlite`, `recabra_roto`, `.db`, `/`, `database` ni el mensaje del
driver. El detalle real va al log del servidor con traza
(`log.exception`), que es donde sirve para arreglarlo — el mensaje crudo de un
driver suele traer la URL de la base y a veces credenciales.

## Caché y bitácora

* **Caché de 5 minutos en memoria**, por `anio_mes`, con `threading.Lock` —
  mismo patrón que `_estado_cache` de `plataforma_estado.py`, más
  `limpiar_cache_metricas()` para las pruebas. Pedir agosto no invalida
  septiembre.
* Un acierto devuelve el **`generado_en` original** (la hora del cálculo:
  mentirla haría creer al operador que mira números más frescos de lo que mira)
  y marca `de_cache: true`. Se devuelve siempre una copia superficial, para que
  el llamador no pueda escribirle `de_cache` al diccionario guardado.
* **La bitácora se anota en CADA consulta, hit de caché incluido**: lo que se
  registra es que este operador **vio** estos números, y eso pasó igual aunque
  el cálculo fuera de hace cuatro minutos. Se escribe DESPUÉS de calcular: si el
  cálculo se cayera, no habría acceso que anotar.
* Tabla `bitacora_plataforma` (registro): `id`, `email`, `accion` (`"metricas"`),
  `periodo`, `en` (UTC). Prueba: tres consultas (cálculo + caché + otro período)
  → tres líneas, en orden.

---

## B) La puerta del operador sin membresías

### Cómo se resolvió la época del token de plataforma

**Se lee de la BASE POR DEFECTO, para el rol `worker`**:
`epoca_de(sesion_registro(), "worker")`.

La cadena que obliga a esto es concreta: `require_auth` valida la época contra
`Depends(get_db)`, que es la sesión que devuelve `cliente_del_pedido`. Para el
token de la consola ese cliente es el sintético, cuya `db_name` es la base por
defecto. Si la época se emitiera contra cualquier otra base, el token no
validaría contra nada y moriría en el primer pedido. Es decir: **no es una
elección estética, es la única que cierra el circuito.**

Consecuencia que conviene tener escrita: en producción la base por defecto es
también la de `galerias`, así que si el admin de galerias cambia la contraseña
de `worker` (que sube `token_epoch_worker` en esa base) el token de la consola
se cierra y el operador tiene que volver a entrar. Es molesto una vez cada
tanto, no es un agujero: cierra de más, nunca de menos. La alternativa —no
comprobar época para este token— sería quitarle una defensa; la otra —una época
propia en `app_config` del registro— es una clave nueva y una regla nueva para
ahorrar un re-login. No valía.

### Mecánica, en los dos puntos exactos

1. **`decode_token`** (`app/auth.py`): cuando el token trae `sub` **y**
   `cliente == "plataforma"`, se valida `es_operador(email del token)` **en
   lugar de** `_membresia_activa`. Sólo para ese slug: cualquier otro `cliente`
   sigue pasando por el chequeo de membresía de siempre. `es_operador` lee
   `OPERADOR_EMAILS` del entorno en cada llamada, así que **sacar el correo de
   la variable corta el token en el pedido siguiente**, sin caché de por medio
   (probado en `test_sacar_el_correo_de_operador_mata_el_token_de_la_consola`).
2. **`cliente_del_pedido`** (`app/clientes.py`): el slug `plataforma` resuelve
   a un `Cliente` sintético (base por defecto = registro) **sólo si el path
   empieza con `/api/plataforma`**; en cualquier otro path, **401** — el mismo
   401 que un token que nombra un cliente inexistente, que es exactamente lo que
   ese token es para el resto del sistema. Así el token de la consola no puede
   abrir una base de negocio **por construcción**: aunque mañana alguien monte
   un endpoint nuevo sin acordarse de esto, el pedido no llega a tener sesión de
   base. Probado contra `/api/spaces/`, `/api/spaces/map`, `/api/layout/`,
   `/api/dashboard/kpis`, `/api/suppliers/`, `/api/bitacora/` y
   `/api/clientes/mi-export` → 401 en los siete.

   El cliente sintético **no** pasa por `_aplicar_estado`. Daría el mismo
   resultado (`plataforma` no tiene fila de estado y `/api/plataforma` ya está
   exento del interruptor), pero preguntarlo sugeriría que este slug es una
   cuenta que se puede cortar, y no lo es.

### La forma del JWT no cambia

Los mismos claims de siempre —`role`, `epoca`, `cliente`, `sub`, `email`, más
el `exp` de `create_token`— y ni uno nuevo. Hay una prueba que decodifica el
token y compara el **conjunto exacto** de claves
(`test_la_forma_del_jwt_no_cambia`).

* `role = "worker"` — mínimo privilegio. La consola se defiende con
  `require_operador`, no con el rol del token; si el token se filtrara,
  «worker» es el techo del daño.
* `cliente = "plataforma"` — slug **reservado** en `routers/alta.py`
  (`SLUGS_RESERVADOS`). Se verificó que sigue estándolo y hay una prueba que lo
  fija además de intentar fundarlo (409): si alguien pudiera fundar ese slug,
  este token abriría una base de negocio de verdad.

### La respuesta de `/oauth`

Gana tres campos top-level, hermanos del token —igual que `aviso_cuenta`
(Fase 2) y `pedir_consentimiento` (Fase 3)—: `plataforma: true`,
`cliente: "plataforma"`, `cliente_nombre: "Plataforma"` (más `email` y `nombre`,
que ya viajaban).

* **Operador CON membresías**: flujo actual **intacto**. Tener membresía manda;
  entra a su cliente con el cuerpo de siempre, sin `plataforma` ni
  `cliente_nombre` (probado).
* **Sin membresías y NO operador**: el 403 de hoy, byte a byte, con
  `anotar_fallo` incluido (probado comparando el `detail` literal).
* **Login legado, redacción por rol y `/api/auth/login`**: sin tocar.

### Un detalle que hubo que resolver: el operador sin fila en `usuarios`

El dueño del SaaS puede no tener nunca fila en `usuarios` (jamás fue invitado a
nada). Ese caso moría antes de llegar a la bifurcación, en el 403 de
«no tenés invitación». Se le agregó la excepción de operador **también ahí**:
`if usuario is None and not invitaciones and not es_op`. No abre ninguna puerta
nueva —quien decide quién es operador es `OPERADOR_EMAILS`, es decir quien
despliega, y esa puerta ya estaba abierta—; sólo evita que el token necesite un
`sub` que nadie creó nunca.

El camino de la consola **no escribe una línea en la bitácora de ningún
cliente** (no hay cliente al que entrar, y escribir en la base por defecto sería
escribir en la de `galerias`). Lo que sí queda es `ultimo_login` en el registro.
Tampoco se le pide consentimiento de la política: no se crea ninguna membresía,
así que el gate de Fase 3 no aplica — el operador es el responsable del
tratamiento, no un titular al que se le pide permiso para entrar a un cliente.

---

## Política de Tratamiento de Datos: ¿sube `VERSION_POLITICA`?

**Recomendación: NO subirla. Es aclaración editorial, no re-consentimiento.**
(La edición de `docs/legal/politica-datos.md` y su copia en
`frontend/src/legal/` está fuera de mi territorio; esto es la justificación que
me pidieron dejar por escrito.)

El razonamiento, en tres pasos:

1. **`VERSION_POLITICA` gobierna un re-consentimiento**, no un changelog: subirla
   hace que `_tiene_consentimiento_vigente` dé falso para **todos** los usuarios
   existentes, que empiezan a recibir `pedir_consentimiento: true` y, en el
   canje de invitaciones, un 428. Es una acción sobre las personas, y sólo se
   justifica cuando cambia **a qué están consintiendo**.
2. **Acá no cambia el tratamiento de datos de ningún titular.** Los datos
   personales que la política cubre son los de los usuarios de los clientes
   (correo, nombre, IP, bitácora). Lo que la Fase 4 agrega es que el operador ve
   **agregados de negocio**: conteos, porcentajes, sumas de canon y un top de
   proveedores por nombre. Ningún dato personal nuevo cambia de manos: el JSON
   no lleva ni un correo ni un nombre de usuario final, y el único dato de
   persona que se acerca —el último acceso— sale sin hora y **sin identidad**.
   El operador ya veía, desde la Fase 2, el nombre del cliente, su estado de
   cuenta y las solicitudes de supresión con el correo de quien las pidió. Las
   dos correcciones de la iteración 2 (saneo del nombre del proveedor y
   supresión K=3) **achican** todavía más lo que sale, así que no mueven el
   análisis en la dirección de un re-consentimiento: mueven en la contraria.
3. **Es una declaración de transparencia**, que es exactamente lo que la spec
   pide («la Política debe **declarar** que el operador ve métricas
   agregadas»), y la política todavía es **BORRADOR** con `[COMPLETAR]` /
   `[VALIDAR CON ABOGADO]`: no se ha publicado ni recogido consentimiento
   contra un texto definitivo, así que no hay nada que re-consentir.

**Salvedad, y por eso lleva `[VALIDAR CON ABOGADO]`**: si el abogado considera
que «un tercero (el operador) accede a información derivada de los datos del
titular» es una finalidad nueva y no una precisión de la existente, entonces sí
corresponde subir la versión — y en ese caso hay que subirla **antes** de la
primera publicación real, no después, para no obligar a un re-consentimiento
masivo el día uno. La decisión de fondo es legal, no técnica; lo técnico es que
subirla cuesta una línea (`VERSION_POLITICA` + el encabezado de los dos .md, que
un test fija byte a byte) y que el mecanismo ya está probado.

---

## Verificación

```
# copia aislada del repo (ver "R-0 ter" abajo), con TMPDIR propio:
tar -cf - --exclude=node_modules --exclude=.git --exclude='*.db' . | (cd $COPIA && tar -xf -)
cd $COPIA/backend
rm -f retail_espacios.db recabra_*.db && python -c 'import app.main'   # ok
rm -f retail_espacios.db recabra_*.db && TMPDIR=$COPIA/tmpdir1 python -m pytest -q   # ×2
```

* `python -c 'import app.main'` → **ok** (impresión limpia, exit 0).
* **Hallazgo del entorno, no del código (R-0 bis)**: `tests/conftest.py` borra
  en el teardown **todos** los `recabra_*.db` del directorio temporal, no sólo
  los suyos (`glob.glob(os.path.join(carpeta, "recabra_*.db"))`). Con dos
  procesos de pytest corriendo a la vez sobre el mismo `/tmp` —que es lo que
  pasa cuando dos builders verifican en paralelo— uno le borra al otro la base
  de cliente que tiene abierta, y salen fallas fantasma del estilo
  `attempt to write a readonly database` o `file is not a database`, repartidas
  al azar entre `test_plataforma_ataques.py` y las pruebas nuevas. Es el mismo
  hallazgo R-0 de `docs/ESTADO.md` visto por su otra cara («si dos procesos
  comparten el mismo directorio»). El arreglo de fondo —que el glob use un
  subdirectorio por prueba, o que borre por prefijo del archivo de esa prueba—
  vive en `tests/conftest.py`, fuera del territorio de este builder.
* **R-0 ter, visto en vivo en esta iteración**: `TMPDIR` propio **no alcanza**.
  El paso obligatorio `rm -f backend/retail_espacios.db backend/recabra_*.db`
  es *del árbol de trabajo*, no del temporal: cuando otro agente lo ejecutó
  para arrancar su propia corrida, le borró la base por defecto a la mía **a
  mitad de camino**. La verificación de esta iteración se hizo por eso sobre
  una **copia entera del repo** (`tar` sin `.git` ni `node_modules`, 38 MB) con
  su propio `TMPDIR`: es el único aislamiento que resiste a otro proceso
  corriendo el mismo comando de limpieza. Vale la pena que quede escrito para
  quien verifique en paralelo.
* `tests/test_plataforma_metricas.py` → **40 pruebas, todas verdes** (corrida
  aislada del archivo, exit 0).
* **Suite completa (565 pruebas): 3 fallas, todas en
  `tests/test_metricas_ataques.py`, y las tres son esperadas.** Ni una sola
  regresión de Fases 1-3, y ni una falla en ningún otro archivo:

  ```
  FAILED test_metricas_ataques.py::test_m29_..._filtra_el_correo   [XPASS(strict)]
  FAILED test_metricas_ataques.py::test_m30_..._el_valor_individual [XPASS(strict)]
  FAILED test_metricas_ataques.py::test_m26_el_cliente_suspendido_...
  ```

  1. **m29 y m30 son XPASS(strict)** — el propio pytest lo dice con esas
     palabras: los dos `xfail` que marcaban H-1 y H-2 ahora pasan, y
     `strict=True` convierte eso en rojo **por diseño**, para que nadie se
     olvide de sacarles el marcador. Es la **confirmación** de que las dos
     correcciones están hechas, no un problema. No los toqué: ese archivo es
     de su dueño.
  2. **m26 es una tabla a re-basar**: el cliente `beta` de ese escenario tiene
     **2** contratos sembrados, así que su `ingreso_contratado_mes` ahora sale
     `null` por K=3 (`assert None == 2000022.0`). El número nuevo es el
     correcto.
* **`test_metricas_conciliacion.py` está enteramente verde** (39 pruebas, con
  el único `xfail` que queda siendo M-1, el del caché del `estado_cuenta`, que
  no es de esta iteración). Su dueño ya destapó los tres hallazgos b-1/m-1 y
  ajustó sus tablas mientras yo corregía: las cuentas de las dos partes
  coinciden.
* El `rm -f backend/retail_espacios.db backend/recabra_*.db` antes de cada
  corrida es obligatorio, no higiene (gotcha **R-0** de `docs/ESTADO.md`:
  `test_correo_api.py` importa `app.services.mailer` a nivel de módulo y deja
  `app.database` clavado contra `backend/retail_espacios.db`).
* `cd frontend && npx tsc --noEmit` → **limpio (exit 0)**, también después de
  esta iteración. Este builder no tocó un solo archivo de `frontend/`; el diff
  de `frontend/**` de la rama es de otro builder de la fase, así que ese tsc
  mide su trabajo tanto como confirma que el backend no le rompió el contrato
  de tipos. Los dos importes que la regla K=3 puede poner en `null` ya estaban
  tipados `number | null` de su lado, así que el cambio de contrato **no le
  rompe la compilación**.

### Qué cubren las 40 pruebas

Datos sembrados a mano (dos clientes fundados por el alta real, más `galerias`
vacío y un cliente con la base rota), con los números elegidos para que el
promedio ponderado (750.000) y el promedio de promedios (712.500) den
**distinto**: si alguien cambiara la cuenta por la equivocada, el test lo dice.
El cliente BETA lleva **tres** contratos a propósito — es el mínimo que la regla
K=3 deja publicar—, y la góndola doble del cliente ACME se sembró **sin**
`faceB`, que es el caso que el criterio viejo contaba mal.

* Los ocho agregados de un cliente, comparados con el diccionario completo.
* Góndola doble = 2 caras **con y sin `faceB`**; tipo legado `gondola_doble`
  también = 2 caras; contrato sobre la cara B «invisible» ocupa (2 caras,
  50,0 %); `rentable: false` excluido; `rentable` ausente incluido; sede con
  plano vacío no cuenta; contrato de un día cuenta en su mes y no en otro;
  contrato cancelado no cuenta; contrato sobre espacio sin mueble no infla la
  ocupación; empate en el top desempatado alfabéticamente; ocupación `null` sin
  denominador; cliente **suspendido** presente con métricas.
* **Celda chica (K=3)**: con 1 y con 2 contratos los tres campos de plata se
  suprimen y el canon individual no aparece en ningún número de la respuesta;
  con 3 se publican; la supresión no toca conteos ni ocupación; el consolidado
  se calcula con los datos subyacentes de las filas suprimidas y **no** cuadra
  con la suma de las filas visibles; el consolidado también se suprime si toda
  la plataforma tiene menos de 3 contratos.
* **Saneo del nombre del proveedor**: un nombre con correo y celular sale
  enmascarado, ningún string del JSON trae una arroba, y el saneo **no**
  reagrupa (tres filas del mismo proveedor sucio siguen siendo un proveedor con
  3 contratos) ni recorta un código interno de menos de 7 dígitos; tope de 80
  caracteres con recorte limpio.
* Consolidado ponderado y excluyendo al cliente con error.
* Base rota: fila con error, resto funciona, error sin filtrar la base.
* Caché: 2ª llamada `de_cache: true` con el mismo `generado_en`; otro período no
  se sirve del caché del primero.
* Bitácora: una línea por CADA consulta, la cacheada incluida.
* Read-only verificado con una foto antes/después de la base del cliente.
* 403 no-operador y legado; 401 sin credencial; 422 con siete períodos malos;
  período por defecto = mes en curso en UTC.
* Frontera del JSON: ninguna clave prohibida, ningún correo de usuario final,
  los únicos arreglos son `clientes` y `top_proveedores`, cada proveedor con
  exactamente dos campos.
* `/oauth` operador sin membresías → token con `plataforma: true`; ese token da
  200 en `/api/plataforma/soy`, `/metricas` y `/clientes`, y **401** en los
  siete endpoints de negocio probados; no-operador sin membresías → el 403 de
  siempre; operador con membresías → flujo intacto; forma del JWT sin cambios;
  slug `plataforma` sigue reservado.

## Lo que les toca a los auditores (no lo toqué: son sus archivos)

Las tres correcciones cambian números que sus tablas fijaban. **Ninguna de
estas fallas es una regresión**: en todos los casos el valor nuevo es el
correcto y el viejo era el defecto que ellos mismos reportaron. Lo que hace
falta es re-basar, y sacar el `xfail` de los cinco hallazgos ya cerrados.

**`tests/test_metricas_ataques.py` — tres cosas, todas suyas**

1. `test_m29_hallazgo_un_proveedor_con_correo_en_el_nombre_filtra_el_correo`
   → **XPASS(strict)**. El correo ya no sale; el test pasa tal cual está
   escrito. **Sacarle el `xfail`.**
2. `test_m30_hallazgo_celda_de_uno_el_agregado_es_el_valor_individual`
   → **XPASS(strict)**. Con un solo contrato los tres campos de plata van
   suprimidos y ningún número de la respuesta coincide con `CANON_1`.
   **Sacarle el `xfail`.**
3. `test_m26_el_cliente_suspendido_aparece_con_sus_metricas_y_sin_su_motivo`
   → **falla de tabla, a re-basar**:
   `assert beta["metricas"]["ingreso_contratado_mes"] == BETA_INGRESO` da
   `assert None == 2000022.0`. El cliente `beta` del escenario tiene **2**
   contratos sembrados (`CANON_5`, `CANON_6`), o sea por debajo de K=3.
   El consolidado (6 contratos) no se movió.
   **La forma más barata de re-basar sin perder el ataque**: sembrarle un
   **tercer** contrato a `beta` con otro canon primo. El escenario sigue
   siendo el mismo, `beta` vuelve a publicar sus importes y las invariantes de
   M-1/M-2/M-3 se conservan enteras. La alternativa —afirmar `is None`— también
   sirve, pero deja al escenario sin ninguna fila de cliente con importes
   visibles, que es justo lo que M-2 y M-3 quieren atacar.
   Ojo con `test_m3_ningun_monto_individual_aparece_suelto` si eligen esa
   variante: sigue verde en las dos, porque la supresión sólo lo ayuda.

**`tests/test_metricas_conciliacion.py` — nada pendiente**

Su dueño ya destapó los tres hallazgos (b-1 ×2 y m-1) y ajustó sus tablas
mientras yo corregía. El archivo corre **entero en verde** (39 pruebas) contra
este código, con un único `xfail` vivo: `test_hallazgo_M1_..._queda_viejo_tras_el_patch`,
el del caché de 5 minutos sirviendo un `estado_cuenta` viejo, que **no es de
esta iteración** y sigue abierto.

Dato útil por si re-tocan el escenario: su góndola doble de `N1` trae `faceB`,
así que el cambio b-1 **no les movió ninguna cuenta de caras ni de ocupación**;
lo único que la corrección b-1 cambia en su archivo son los tres tests de
hallazgo, que ahora pasan.

---

## Pendientes / notas para quien siga

* **Para el frontend (cambio de contrato de la iteración 2)**:
  `ingreso_contratado_mes` **ahora puede ser `null`** (antes, un cliente sin
  contratos daba `0.0`), y `top_proveedores` puede venir vacío aunque el cliente
  tenga plata. La pantalla tiene que distinguir «suprimido» de «cero»: lo
  honesto es un guion o un «sin datos suficientes», nunca un `$0` — decirle al
  operador que un cliente factura cero cuando en realidad factura poco es peor
  que no decirle nada. Los conteos y `ocupacion_pct` no cambiaron.
  **Buena noticia**: la pantalla que ya está en la rama lo aguanta sin tocar
  nada — `frontend/src/api/plataforma.ts` ya tipa los dos importes como
  `number | null` y `Plataforma.tsx` los pasa por `formatoCOP(... ?? null)`,
  que pinta un guion. Lo único que conviene agregar es el **por qué** del
  guion (un tooltip o una nota al pie: «se oculta con menos de 3 contratos»),
  para que el operador no lo lea como un cero ni como un error de carga.
* **Para los auditores**: los cinco `xfail(strict=True)` que marcaban b-1 (×2),
  m-1, M-29 y M-30 pasan con este arreglo. Los tres de conciliación ya fueron
  destapados por su dueño; quedan **M-29 y M-30** en `test_metricas_ataques.py`
  como XPASS(strict), más la tabla de `beta` en `m26`. Detalle en «Lo que les
  toca a los auditores».

* **El caché es por proceso.** Con más de un worker de uvicorn, dos operadores
  pueden ver `generado_en` distintos dentro de la misma ventana de 5 minutos.
  Es el mismo compromiso que ya toma `_estado_cache`; moverlo a una tabla o a
  Redis sería una decisión de infraestructura, no de esta fase.
* **`bitacora_plataforma` no se purga.** Crece una fila por consulta. Con un
  operador y un panel que se mira a mano es despreciable; si el frontend
  llegara a poner un auto-refresh cada 30 s, hay que revisarlo (el repo ya tiene
  un `purgar` para `audit_log` en `services/bitacora.py` que sirve de molde).
* **El endpoint no pagina.** Con N clientes la respuesta crece linealmente en
  filas, no en tamaño por fila; a partir de unas decenas de supermercados
  convendrá cortar el listado o mover el detalle a un endpoint por cliente.
* El token de la consola muere si sube `token_epoch_worker` de la base por
  defecto (ver «Cómo se resolvió la época», arriba). Vale la pena que
  `docs/ESTADO.md` lo diga cuando se documente la fase.
