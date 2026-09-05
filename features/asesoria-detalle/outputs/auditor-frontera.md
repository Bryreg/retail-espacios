# Auditor de frontera — red team de `GET /api/plataforma/clientes/{slug}/detalle`

**Fase 8**, rama `claude/fase-7-transparencia`, sin commit ni push.
Artefacto de código único: `backend/tests/test_detalle_ataques.py` (NUEVO, 39
tests). Ningún archivo de producción fue tocado.

**Estado al cierre:** el endpoint YA existía cuando corrí (el agente
`backend-detalle` aterrizó `app/plataforma_detalle.py` + la ruta al final de
`routers/plataforma.py` antes de mi primera corrida), así que los 39 tests se
ejecutaron contra código real y no quedó ninguno "escrito a ciegas".

```
cd /tmp/retail-espacios-test/backend
mkdir -p /tmp/pt-auditor-frontera
TMPDIR=/tmp/pt-auditor-frontera python -m pytest -q tests/test_detalle_ataques.py
# 37 passed, 2 xfailed  (dos corridas seguidas, idéntico resultado)
TMPDIR=/tmp/pt-auditor-frontera python -m pytest -q tests/test_montaje_enlace.py
# 23 passed
```

Los dos `xfail` son `strict=True`: si alguien arregla el defecto, el test se
vuelve rojo por XPASS y hay que quitarle el marcador. Ninguna aserción se
ablandó para que la suite quedara verde.

---

## 1. Hallazgos

| id | sev | qué se probó | resultado | test que lo fija | xfail |
|---|---|---|---|---|---|
| **detalle-1** | **media** | `Space.zone` es texto libre del cliente y el detalle lo publica en `espacios[].zona`. Se sembró `zone = "Zona Fria contacto ventas@sur.example tel 300 555 8899"` y se exigió la invariante de la fase: ningún string del JSON con arroba ni con los dígitos del teléfono. | **FALLA.** La zona viaja VERBATIM: `proveedor` y `marca` pasan por `sanear_nombre_proveedor`, `zona` no. Un correo o un celular tecleado en el nombre de la zona cruza la frontera entero, y con él la invariante que d02/d03 defienden. | `test_d09_la_zona_del_espacio_tambien_tiene_que_salir_saneada` | sí |
| **detalle-2** | baja | El `CATALOGO` declara `contrato_marca` con `tratamiento: "exacto"`. Se comparó la declaración contra lo que el código hace. | **FALLA.** `_contrato_publico` sanea la marca (`sanear_nombre_proveedor(contrato.marca)`), igual que al proveedor. El catálogo es el documento con el que el titular audita el trato; describir "exacto" donde el código sanea lo describe mal. Va en la dirección segura (el dato sale MÁS protegido de lo declarado), por eso es baja. | `test_d34_el_catalogo_declara_el_tratamiento_que_el_codigo_aplica` | sí |

### Lo que aguantó (sin un solo cruce)

Todo lo demás. En particular, y contra sentinelas únicos y primos sembrados a
propósito:

- **Ni una hoja** con `Supplier.contact_name/phone/email/notes`, `Space.notes`,
  `SpaceLease.notes`, el `filename` ni los bytes de `SpaceFile`/`LeaseFile`
  (d01). La garantía es de construcción: `_contratos_del_cliente` y
  `_zona_y_area` seleccionan columnas por nombre, así que esas tablas ni se
  leen.
- **Ninguna arroba** en ningún string del JSON, ni con tres cuentas de usuario
  sembradas en el cliente (d02, d05).
- El teléfono del proveedor **no sobrevive en ninguna forma** —junto, con
  guiones, con puntos medios— y `sanear_nombre_proveedor` es idempotente sobre
  cada nombre publicado (d03), incluso con la arroba de ancho completo y el
  teléfono partido por espacios de ancho cero del hallazgo frontera-1 (d09b).
- Las máscaras exactas `[correo oculto]` / `[teléfono oculto]` aparecen en los
  **cinco** lugares donde viaja el nombre (contrato del espacio, proveedores,
  movimientos, candidatos, recomendaciones) y el crudo en ninguno (d04).
- **Ninguna clave prohibida** en ningún nivel, incluidos los `datos` de cada
  recomendación; el shape es exacto clave por clave, ni una de más ni de menos
  (d06).
- La **tarifa de referencia** —cargada por el camino real, `PUT /api/layout/rates`
  con el admin del cliente— no sale como número, ni como texto, ni multiplicada
  o dividida por 1..4; sólo el booleano `tarifa_configurada` (d07).
- Los campos comerciales denormalizados del plano (`supplierName`,
  `negotiatedValue`, `observation`, `nomenclatura`, `label`) **no viajan**: los
  contratos salen de `space_leases` (d08).
- **Cross-tenant limpio**: nada de B en el detalle de A, ni como número exacto
  ni como subcadena (d10); el `benchmark_plataforma` es `{tipo: float}` plano y
  vale exactamente `_plata((a+b)/2)` con un contrato de punta en cada cliente
  (d11); ninguna cabecera ni query cambia de base (d12); el 403 del dueño de A
  es **indistinguible** contra su cliente, contra el ajeno y contra uno
  inexistente (d13); ninguna ruta GET fuera de `/api/plataforma` devuelve el
  shape del detalle (d14).
- **Solo lectura medible**: conteos de `suppliers`/`spaces`/`space_leases`/
  `space_files` y **hash sha256 del archivo sqlite** idénticos después de tres
  consultas (d40).
- **Bitácora**: una línea por consulta (sin caché que las ahorre), sin un solo
  dato de negocio adentro, visible en el reporte del titular y **sólo** en el
  suyo (d30–d32).

---

## 2. Los 39 tests, con su pregunta de frontera

### A. Fugas de la propia base

| test | pregunta |
|---|---|
| `d01` | ¿Sale alguna de las ocho columnas prohibidas (contactos, notas, archivos)? |
| `d02` | ¿Queda algún correo? (acá no hay `accesos.operador`: la invariante es absoluta) |
| `d03` | ¿El teléfono sobrevive junto o con separadores? ¿El saneo es idempotente sobre cada nombre publicado? |
| `d04` | ¿Hay algún rincón del shape donde el nombre salga sin enmascarar? |
| `d05` | ¿Se cuela un correo, nombre o id de la gente del supermercado? |
| `d06` | ¿Hay una clave prohibida en algún nivel? ¿El shape es exacto? |
| `d07` | ¿Se puede despejar la tarifa de referencia (valor, múltiplos, divisores, suma)? |
| `d08` | ¿De dónde saca los contratos: de `space_leases` o del JSON del plano? |
| `d09` | ¿Y los textos libres que el shape publica y **nadie** sanea? → **detalle-1** |
| `d09b` | ¿El saneo aguanta el Unicode del copy-paste real (`＠`, ZWSP)? |

### B. Cross-tenant

| test | pregunta |
|---|---|
| `d10` | ¿El detalle de A deja ver algo de B (slug, nombre, proveedor, marca, canon, correos)? |
| `d11` | ¿El benchmark se puede desagregar hasta un cliente? |
| `d12` | ¿El slug de la ruta se puede sobreescribir con `X-Cliente` o `?cliente=`? |
| `d13` | ¿El 403 delata si el cliente existe o si es el suyo? |
| `d14` | ¿Hay otra puerta GET por la que salga el detalle? |
| `d15` | ¿Una base rota tumba o contamina el detalle de otro cliente? |

### C. Autenticación y errores

| test | pregunta |
|---|---|
| `d20` | ¿Pide credencial antes de mirar el slug? (401, nunca 404 a un anónimo) |
| `d21` | ¿Entra alguien que no es operador por alguna variante (5 credenciales)? |
| `d22` | ¿El 404 dice de más? ¿`" ALFA "` se normaliza? |
| `d23` | ¿La ventana de período es la misma que la de `/metricas`? (15 valores, los dos endpoints) |
| `d24` | ¿La base rota delata la ruta del archivo? ¿Deja constancia de un acceso que no ocurrió? |
| `d25` | ¿El interruptor de cobranza le tapa el negocio al operador? (no: 200 en los tres estados) |
| `d26` | ¿El enlace de la mercaderista alcanza al endpoint nuevo? |

### D. Bitácora y reporte

| test | pregunta |
|---|---|
| `d30` | ¿Dos consultas dejan dos líneas, o el caché ahorra una? |
| `d31` | ¿La bitácora se vuelve una copia de lo que se miró? |
| `d32` | ¿El titular se entera de la consulta más profunda, y sólo él? |
| `d33` | ¿Lo que el detalle publica está declarado en el catálogo? |
| `d34` | ¿El catálogo describe lo que el código HACE? → **detalle-2** |

### E. Sólo lectura y orden

| test | pregunta |
|---|---|
| `d40` | ¿"Solo lectura" es una promesa del docstring o una propiedad medible? |
| `d41` | ¿La garantía está en el código? (`grep` estático del módulo) |
| `d42` | ¿La ruta paramétrica se traga alguna literal de `/api/plataforma`? |
| `d43` | ¿La URL acepta algo más que leer? (OpenAPI + 405 en los cuatro verbos) |

### F. Coherencia interna que protege la frontera

| test | pregunta |
|---|---|
| `d50` | ¿Los agregados por tipo cuadran con las filas que el mismo JSON publica? |
| `d51` | ¿Un candidato puede ser un proveedor que no es de este cliente, o el ocupante? |
| `d52` | ¿La `explicacion` —el único texto en prosa— arrastra PII? ¿El vocabulario es cerrado? |
| `d52b` | ¿Y el cliente que todavía no vendió nada? (exactamente `[arranque]`) |
| `d53` | ¿Alguna fecha viaja con hora? |
| `d54` | ¿La cara `-B` sale como el espacio que es, con el tipo de su góndola? |
| `d55` | ¿Un contrato fuera del plano inventa un espacio? |

---

## 3. Dos desvíos de mi brief, y por qué

Los anoto porque son casos donde el código **es correcto** y la instrucción que
recibí describía otra cosa. Ablandar la aserción habría sido lo fácil; escribir
la aserción equivocada, lo peor de todo.

1. **`d21`: el operador con `OPERADOR_EMAILS` vacío responde `401`, no `403`.**
   El brief pedía 403. El token de la consola lleva `cliente == "plataforma"` y
   lo único que lo mantiene vivo es que su correo siga en la env
   (`app/auth.py:493-507`, decisión documentada de la Fase 4): sacar el correo
   no lo deja adentro sin permisos, **lo mata**. Es más estricto que el 403 que
   reciben las credenciales que nunca fueron operador. El test afirma el 401
   real, con el porqué escrito al lado.

2. **`d41`: el `grep` literal de `".add("` daría un falso positivo.**
   `plataforma_detalle.py` tiene cinco `.add(` — todos sobre `set` de Python
   (`registro["tipos"].add(...)`, `sedes_por_tipo.setdefault(tipo, set()).add(...)`),
   exactamente como los tiene `plataforma_metricas.py`, el módulo de referencia
   de esta disciplina. Prohibir el texto a secas daría rojo por el motivo
   equivocado. El test mira el **receptor**: prohíbe
   `(db|reg|sesion|session|s|conn|connection).(add|delete|commit|flush|execute|merge|bulk_*)`,
   exige que `".commit("`, `".delete("`, `".flush("`, `".execute("`, `"bulk_"`,
   `"set_config("` y las palabras SQL de escritura no aparezcan en ningún lado,
   y verifica que cada `.add(` restante se vea como un set.

---

## 4. Lo que dependía de otros agentes

| agente | qué necesitaba | estado |
|---|---|---|
| `backend-detalle` | el endpoint y `app/plataforma_detalle.py` | **Aterrizó antes de mi primera corrida.** Los 39 tests corrieron contra código real; ningún gap por endpoint ausente. |
| `legal-catalogo` | la rama `detalle` en `_accesos_del_cliente` y las entradas del `CATALOGO` | **Aterrizó.** `d32` y `d33` pasan sin `xfail`: hay 12 entradas con `endpoints == ["detalle"]`, una de ellas `saneado`, y el acceso `accion="detalle"` aparece en el reporte del dueño de A y no en el de B. |
| `frontend-detalle` | nada mío depende del frontend | n/a — no corrí `tsc` ni `build` (fuera de mi territorio). |

## 5. Qué observé del código real (`git diff`)

- **`app/plataforma_detalle.py`** (nuevo, ~1.100 líneas) es sólido en lo que a
  la frontera respecta. Tres decisiones que hacen el trabajo:
  `_zona_y_area` hace `db.query(Space.code, Space.zone, Space.area_m2)` —
  selecciona columnas por nombre, así que `Space.notes` y `Space.id` **no
  pueden** llegar al JSON por descuido; `_contratos_del_cliente` hace lo mismo
  con `space_leases` (nunca `notes`, nunca ids); y las cuatro columnas de
  contacto de `suppliers` no se leen en todo el módulo. El benchmark está
  acotado por tipo de retorno a `dict[str, float]`, que es lo que impide que
  ahí se cuele un desglose por cliente.
- **`_indice_de_proveedores` agrupa por el nombre CRUDO y publica el saneado**,
  igual que `_top` de `plataforma_metricas`. Es lo correcto: agrupar por la
  versión enmascarada fundiría dos proveedores distintos en una fila y el
  conteo mentiría. El nombre crudo queda en la clave interna `"crudo"` del
  índice, que **no** se publica (`_armar_proveedores` copia campo por campo) —
  d06 lo fija afirmando el shape exacto de `proveedores[]`.
- **La ruta está declarada al final de `routers/plataforma.py`**, después de
  `/clientes/{slug}/reporte` y de todas las literales, con el comentario que
  explica por qué aunque hoy no chocaría (d42 lo fija con `rutas_planas`).
- **La bitácora se escribe DESPUÉS de armar**, que es lo que hace que una base
  ilegible no deje constancia de un acceso que nunca leyó un dato (d24).
- `app/plataforma_metricas.py` sólo GANÓ dos funciones (`_del_periodo`,
  `_contratos_del_cliente`); `_contratos_activos` no cambió de firma ni de
  comportamiento. Nada de la Fase 7 se deshizo.

---

## 6. Recomendaciones para el Verificador

**Qué correr, en este orden:**

1. `TMPDIR=/tmp/pt-verif python -m pytest -q backend/tests/test_detalle_ataques.py`
   — 37 passed, 2 xfailed. **Si algún `xfail` sale `XPASS`, es rojo y está
   bien**: significa que alguien arregló `detalle-1` o `detalle-2` y hay que
   quitarle el marcador al test, no bajarle el `strict`.
2. `tests/test_plataforma_detalle.py` (el del builder) y
   `tests/test_transparencia_ataques.py` (Fase 7, misma rama: la 8 va encima y
   no la puede deshacer).
3. `tests/test_montaje_enlace.py` — es el barrido que garantiza que ningún GET
   nuevo con parámetro de ruta quedó abierto al token de montaje; el `{slug}`
   ya estaba en el `relleno` desde la Fase 7, así que el endpoint nuevo entró
   solo. Verificar que el contador `revisadas >= 27` siga cumpliéndose.
4. `tests/test_metricas_ataques.py`, `test_asesoria_ataques.py`,
   `test_auditoria_frontera.py`, `test_plataforma_reporte.py` — las fronteras
   anteriores, que esta fase no debía mover.
5. Recién ahí la suite completa (dos veces en serie) y `tsc` + `build`.

**Qué mirar con lupa en la revisión de código:**

- **`detalle-1` es el que yo arreglaría antes de mergear.** La corrección es de
  una línea en `_zona_de` (`return sanear_nombre_proveedor(zona) or None`) y
  vale la pena extenderla a la misma clase de dato: `sede` y `codigo` /
  `codigo_corto` salen también del texto que teclea el cliente y tampoco pasan
  por el saneo. No les escribí test porque son cortos y en mayúsculas (el
  vector es mucho menos plausible que el de un nombre de zona), pero la regla
  correcta es "todo texto libre del cliente que cruza la frontera pasa por
  `sanear_nombre_proveedor`", no "los dos campos que nos acordamos".
- **`detalle-2` se arregla cambiando una palabra** en `CATALOGO`
  (`contrato_marca` → `"tratamiento": "saneado"`). Al hacerlo, `d34` pasa a
  XPASS: hay que quitarle el `@pytest.mark.xfail`.
- El `benchmark_por_tipo` abre **todas** las bases de clientes en cada cálculo
  (caché de 5 min). No es un problema de frontera —lo verifiqué en d11 y
  d15— pero es el único punto del detalle cuyo costo crece con el número de
  clientes; con N grande, el primer pedido de cada ventana de 5 minutos paga N
  aperturas de base.
- `d40` (hash del archivo sqlite) es el test que yo pondría a correr en cada
  cambio de este módulo: es el único que no se puede engañar con un docstring.
