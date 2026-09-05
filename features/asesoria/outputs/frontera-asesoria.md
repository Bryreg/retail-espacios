# Red team de la frontera del operador — Fase 6 (spread + `/adopcion`)

**Auditor:** Frontera Asesoría · **Rama:** `claude/fase-6-asesoria` · **Sin commit ni push.**

**Archivo de ataques:** `backend/tests/test_asesoria_ataques.py` (19 tests, `a1`–`a19`).
**Única edición fuera de tests:** `docs/legal/politica-datos.md` §5.3 + su copia byte-idéntica
en `frontend/src/legal/politica-datos.md`.

**Resultado:** `17 passed, 2 xfailed` — dos hallazgos abiertos (`xfail(strict=True)`) y una
caracterización medida que la spec ya acepta pero que conviene tener escrita.

```
cd backend && TMPDIR=/tmp/pt-frontera-asesoria python -m pytest -q tests/test_asesoria_ataques.py
→ 17 passed, 2 xfailed

cd backend && TMPDIR=/tmp/pt-frontera-asesoria python -m pytest -q tests/test_compliance_ataques.py -k politica
→ 11 passed · y X-21 (`-k x21`), que exige que las dos copias sean byte-idénticas, también pasa
```

El builder llegó primero: `spread_pct` y `GET /api/plataforma/adopcion` ya existían al
arrancar la auditoría, así que los ataques se corrieron contra el código real y no contra
un contrato de papel.

---

## 1. Tabla de ataques

| # | Ataque | Resultado |
|---|---|---|
| a1 | Tarifas jugosas e irrepetibles (default góndola 1.234.567, NAVE góndola 7.654.321, default punta 2.468.013) sembradas y buscadas —ellas, sus múltiplos hasta 6 y la Σ— en cada hoja y en el cuerpo serializado de `/metricas`, `/tendencia` y `/adopcion`; más el despeje `ingreso/(1+spread)` contra las tarifas unitarias | **Resistió** |
| a2 | Lista blanca exacta de `/metricas` con los campos nuevos + lista negra (`rates`, `by_sede`, `default`, `tarifa_total`, `canon_con_tarifa`, `contratos_con_tarifa`, `spread_abs`, `tarifa`) y "ninguna clave con `tarifa` salvo las tres taxativas" | **Resistió** |
| a3 | K=3 del spread por sus tres bordes: 2 contratos con tarifa → `null`; 1 → `null`; consolidado con Σ < 3 → `null` | **Resistió** |
| a4 | Tarifa configurada que no aplica a ningún contrato (góndola configurada, contratos de punta) → `spread_pct: null`, `tarifa_configurada: true`, `contratos_sin_tarifa: 3`, y ni la tarifa ni sus múltiplos en el cuerpo | **Resistió** |
| a5 | Lista blanca EXACTA de `/adopcion` en los tres niveles + tipos (`dias_sin_acceso` entero, `con_contratos_activos` booleano, `clasificacion` en los 5 valores, `cohorte` `YYYY-MM`), y que los únicos arreglos sean `cohortes` y `clientes` | **Resistió** |
| a6 | Persona sembrada con id ALTO (987.654.321), nombre `Zutano Improbable`, correo `zutano.improbable@ejemplo.test` y `firebase_uid`: ni una arroba, ni un sentinela, ni el id como número, ni fecha con hora fuera de `generado_en`, ni clave prohibida (`ultimo_login`/`email`/`usuario_id`/`motivo`/`contratos_activos`…), ni un string fuera de las rutas del contrato | **Resistió** |
| a7 | Autorización de `/adopcion`: sin token 401, admin legado 403, dueño con membresías 403, operador sin membresías 200, `OPERADOR_EMAILS` vacía cierra para todos, correo "casi igual" no obtiene token | **Resistió** |
| a8 | Bitácora: tres GET → tres filas `accion="adopcion"` con `periodo` = mes actual UTC; dos operadores → cada fila con SU correo (el caché compartido no reatribuye); ninguna columna lleva dato de negocio | **Resistió** |
| a9 | Orden de rutas (índice real en `app.routes` + comportamiento), `?periodo=2020-01` ignorado, `/adopcion/`, `/adopcionx`, `/ADOPCION`, y las paramétricas `/clientes/{slug}` y `/supresiones/{id}` no capturan `/adopcion` | **Resistió** |
| a10 | POST/PUT/PATCH/DELETE sobre `/adopcion` → 405; foto por inspector de todas las tablas de las bases de negocio y del registro antes/después de dos GET: sólo crece `bitacora_plataforma` (+2) | **Resistió** |
| a11 | El token de consola contra la OTRA puerta a la tarifa: `GET`/`PUT /api/layout/rates` (por cabecera y por `?token=`), `/api/layout/{sede}`, dashboard y suppliers → 401/403; y el admin del cliente sí la lee (el endpoint no está roto) | **Resistió** |
| a12 | Cliente con base ilegible en `/adopcion`: texto FIJO en `error`, `con_contratos_activos: false`, y ni `recabra_roto`, ni `sqlite`, ni `.db`, ni el mensaje del driver en la respuesta | **Resistió** |
| a13 | Cliente suspendido en `/adopcion` con todos sus datos y SIN el `motivo` del estado (que lleva adentro un correo de usuario final) | **Resistió** |
| a14 | `PATCH` de estado → la `/adopcion` siguiente muestra el estado nuevo (el caché de métricas se limpia; adopción no tiene caché propio) y no arrastra el motivo | **Resistió** |
| a15 | La política §5.3 nombra los campos nuevos (tarifa de referencia + relación + umbral de 3; adopción + clasificación + membresía + 30 días + mes de alta + bitácora) y la copia del frontend es byte-idéntica | **Resistió** (tras la edición de §5.3, abajo) |
| a16 | **Caracterización con evidencia** de H-1: el despeje por diferencia contra el consolidado recupera EXACTAMENTE la Σ tarifa y el spread de un cliente suprimido por K=3 | **Hallazgo H-1** (test pasa: documenta la aritmética) |
| a17 | El comportamiento SEGURO de H-1: el spread suprimido no debe poder despejarse desde el consolidado | **Hallazgo H-1** — `xfail(strict=True)` · `backend/app/plataforma_metricas.py:843-848` |
| a18 | Con 3 contratos homogéneos y `contratos_sin_tarifa == 0`, `ingreso/(3×(1+spread/100))` estima la tarifa unitaria con error < 0,05 % | **Hallazgo H-2** (caracterización medida; residual que la spec acepta) · `plataforma_metricas.py:80-92` |
| a19 | Un cliente sano fundado mientras el caché de 5 min de `/metricas` está caliente sale en `/adopcion` con el texto fijo de "base ilegible" y `con_contratos_activos: false` | **Hallazgo H-3** — `xfail(strict=True)` · `backend/app/plataforma_adopcion.py:118-125` |

---

## 2. Hallazgos

### H-1 · El consolidado despeja al cliente que K=3 suprimió — **severidad MEDIA**

`backend/app/plataforma_metricas.py:843-848` (`_consolidar`) suma `canon_con_tarifa`,
`tarifa_total` y `contratos_con_tarifa` sobre **todos** los clientes legibles con tarifa,
los que tienen el spread suprimido incluidos. Cuando ningún contrato queda fuera de la
cuenta (`contratos_sin_tarifa == 0`), `ingreso_contratado_mes` **es** `Σ canon_con_tarifa`,
y el operador resuelve:

```
Σtarifa_total = ingreso_consolidado / (1 + spread_consolidado/100)
Σtarifa_A     = ingreso_A           / (1 + spread_A/100)
Σtarifa_B     = Σtarifa_total − Σtarifa_A          # el cliente suprimido
canon_B       = ingreso_consolidado − ingreso_A
spread_B      = canon_B / Σtarifa_B − 1
```

Verificado con aritmética exacta en `a16`: A con 3 contratos a 900.000 sobre tarifa
1.000.000 (spread −10,0) y B con 2 contratos a 400.000 sobre tarifa 500.000 (spread
suprimido). El despeje devuelve `Σtarifa_B = 1.000.000` y `spread_B = −20,0` — es decir, la
tarifa de referencia unitaria de B (500.000) y el porcentaje que el JSON puso en `null` a
propósito. La spec dice "ni `Σ tarifa` ni ningún valor absoluto derivado de ella aparece en
el JSON": no *aparece*, pero se reconstruye con aritmética de primaria.

Hay un precedente explícito de la Fase 4 (`test_metricas_ataques.py::test_m26`: "su plata
cuenta en el consolidado" — el `Σ canon` de un cliente suprimido ya era despejable así). Lo
que la Fase 6 cambia es la **clase** del dato despejado: de la plata del propio cliente
—que el operador ya ve agregada— a la **tarifa de referencia**, que la spec declara que
NUNCA cruza la frontera. Por eso se marca como hallazgo y no como caracterización heredada.

El ataque necesita pocos clientes legibles con tarifa (dos alcanzan) — el estado normal de
la plataforma hoy — y que el cliente conocido no tenga contratos sin tarifa.

**Arreglos posibles (decisión del builder/Maestro, no del auditor):**

1. **Suprimir el consolidado cuando un solo cliente domina el residuo**: publicar
   `spread_pct` consolidado sólo si al menos **3 clientes** aportan contratos con tarifa
   (una K de segundo nivel, análoga a la que ya existe sobre contratos). Es la más barata y
   no toca el ponderado.
2. **Redondear el spread a entero** (0 decimales): degrada el despeje a un intervalo en vez
   de un valor, y de paso mitiga H-2. El frontend muestra `−12 %` en vez de `−12,4 %`, que
   para una conversación de asesoría alcanza.
3. Dejarlo como está y **documentarlo** en `docs/ESTADO.md` como residual conocido, con la
   misma honestidad con que la Fase 4 documentó el suyo. Si se elige esto, sacarle el
   `xfail` a `a17` y convertirlo en caracterización.

### H-2 · Con 3 contratos homogéneos la tarifa unitaria se estima al 0,05 % — **severidad BAJA**

`plataforma_metricas.py:80-92` (`_spread`) usa `K_MINIMO_CONTRATOS = 3` y redondea a un
decimal. Con exactamente 3 contratos, todos del mismo tipo y sede y sin contratos fuera de
la cuenta, `ingreso/(3 × (1 + spread/100))` devuelve la tarifa unitaria; el único límite es
el redondeo, que deja un error relativo por debajo del 0,05 % (medido en `a18`).

La spec eligió K=3 sabiendo que con 1 o 2 el despeje es exacto; con 3 también lo es, sólo
que el valor despejado es el promedio de tres posiciones **idénticas**, que es la tarifa.
No se marca `xfail` porque el arreglo (subir K, o redondear el spread a entero) es una
decisión de producto y no un defecto de implementación: el código hace exactamente lo que
la spec pide. Queda medido y vigilado.

### H-3 · `/adopcion` reporta "base ilegible" a un cliente sano — **severidad BAJA** (no es una fuga: es una mentira del panel)

`backend/app/plataforma_adopcion.py:118-125` (`_fila_cliente`) deduce el error de la
**ausencia** del slug en el dict que devuelve `contratos_activos_por_cliente`:

```python
if slug in contratos_por_slug:
    con_contratos_activos = contratos_por_slug[slug] > 0
else:
    con_contratos_activos = False
    error = ERROR_BASE_ILEGIBLE
```

Ese dict sale del **caché de 5 minutos** de `/metricas`, que se llenó con los clientes que
existían en el momento del cálculo. Un cliente dado de alta dentro de esa ventana no está
en el dict y aparece en el panel como roto, con `con_contratos_activos: false`. Es el caso
más común el día de una demo o de un alta self-service, y empuja al operador hacia la
acción equivocada (llamar a un cliente sano para avisarle que su base está caída).

**Arreglo propuesto:** distinguir "no lo pude leer" de "no lo calculé". Dos caminos
baratos, ninguno con migración:

1. Que `_calcular` devuelva también el **conjunto de slugs que sí se recorrieron** (o el de
   los que fallaron) y que la adopción marque `error` sólo para esos; o
2. que `contratos_activos_por_cliente` recalcule cuando el conjunto de slugs del registro no
   coincide con el del caché (una comparación de `set`, sin recorrer bases de más).

---

## 3. Lo que resistió y por qué vale escribirlo

- **La tarifa no toca el JSON por ningún camino.** El builder mantuvo `canon_con_tarifa`,
  `tarifa_total` y `contratos_con_tarifa` **fuera** de `publicas_desde_crudos` —que es la
  función que relee la tendencia desde el snapshot— y los agregó a mano después. Eso hace
  que `/tendencia` no pueda ganar el spread por accidente, y `a1` lo verifica sobre los tres
  endpoints, no sólo sobre `/metricas`.
- **La segunda puerta a la tarifa sigue cerrada.** `GET /api/layout/rates` devuelve el
  `{default, by_sede}` completo y es admin-only; el token de consola no la abre ni por
  cabecera ni por `?token=`, porque `_cliente_de_la_consola` sólo resuelve el slug
  `plataforma` bajo `/api/plataforma`. `a11` deja la prueba escrita para la puerta que
  esta fase volvió interesante.
- **`/adopcion` no filtra personas.** Es el resultado más importante del informe: el
  endpoint lee `usuarios` y `membresias` —donde viven los correos, los nombres y los ids—
  y `_logins_del_cliente` proyecta **sólo** `Usuario.ultimo_login`, reducido a `date` y de
  ahí a un entero de días. No hay un objeto ORM completo cruzando la frontera en ningún
  punto, y `a6` lo comprueba contra un id de nueve dígitos que ningún conteo puede dar por
  casualidad.
- **`con_contratos_activos` es booleano de verdad.** El conteo de contratos existe en el
  dict interno y no sale: la adopción lo reduce a `> 0` en el mismo renglón en que lo lee.

---

## 4. La política de datos (§5.3) — mi única edición fuera de tests

`docs/legal/politica-datos.md` §5.3, +56 líneas, copiado byte a byte a
`frontend/src/legal/politica-datos.md` (`cp` + `cmp`, y X-21 de `test_compliance_ataques.py`
lo exige igual). **`VERSION_POLITICA` NO se subió** — misma justificación que la Fase 4,
con la nota para el abogado escrita adentro del documento.

### Campos declarados

**(i) Relación canon / tarifa de referencia** (`spread_pct`, `tarifa_configurada`,
`contratos_sin_tarifa`, `clientes_con_tarifa`), declarados como: la tarifa de referencia es
información comercial del supermercado y **nunca se muestra al operador** (ni por sede, ni
en promedio, ni sumada); lo único que cruza es la **relación porcentual** entre lo cobrado y
lo que esas posiciones valdrían según su propia tarifa —porcentaje con signo, ponderado,
nunca promedio de promedios—, **si configuró o no** tarifa (sí/no) y un **conteo de
contratos sin tarifa aplicable**; todo bajo el **mismo umbral de 3 contratos** ya descrito
en el punto, con el motivo explícito (con uno o dos, el porcentaje y el canon promedio
publicado despejarían la tarifa individual).

**(ii) Lectura de adopción** (`usuarios_con_cuenta`, `usuarios_activos_30d`,
`dias_sin_acceso`, `con_contratos_activos`, `cohorte`, `clasificacion`,
`retencion_30d_pct`), declarados como: por supermercado, cuántas **cuentas con membresía
activa** tiene, cuántas entraron en los **últimos 30 días**, **cuántos días** pasaron desde
el último acceso de cualquiera de sus cuentas —un número de días, **no quién** entró ni
cuándo entró cada persona—, si tiene **contratos vigentes** (sí/no), el **mes de alta** (mes
y año, sin día) y una **clasificación derivada** calculada por el sistema (nueva / activa /
sin uso con contratos / sin uso sin contratos / sin cuentas), más el agrupado por mes de
alta con el porcentaje de retención a 30 días. Explícito: **ninguna de estas cifras
identifica a una persona** —ni correos, ni nombres, ni identificadores, ni fechas de acceso
individuales—, y **cada consulta queda en la bitácora** con el correo del operador, el
momento y el período.

### Nota al abogado (dentro del documento, marcada `[VALIDAR CON ABOGADO]`)

La decisión de **no subir `VERSION_POLITICA`** queda justificada en los mismos términos que
la Fase 4 (los agregados nuevos caen bajo el mismo umbral de 3 y no identifican personas), y
se le dejan dos preguntas puntuales:

1. Si los **días desde el último acceso** de un supermercado con **una sola cuenta activa**
   dejan de ser un dato de la organización y pasan a ser un dato de esa persona determinable
   —el mismo interrogante que ya plantea la "fecha del último acceso" de la Fase 4—.
2. Si el porcentaje canon/tarifa, aun bajo el umbral de 3, es **información comercial
   reservada del supermercado cliente** cuyo tratamiento convenga cubrir expresamente en el
   contrato de servicio del punto 5.2 (no es dato personal, pero sí dato de negocio de un
   tercero) — la pregunta que H-1 y H-2 vuelven concreta.

### Diff

```diff
--- a/docs/legal/politica-datos.md
+++ b/docs/legal/politica-datos.md
@@ -314,6 +314,42 @@ (§5.3, después del párrafo del umbral de 3 contratos)
+> **[VALIDAR CON ABOGADO]**
+
+Desde la misma consola, y con el mismo alcance —solo lectura, solo agregados, con
+constancia en la bitácora—, el operador ve además dos lecturas incorporadas después:
+
+**La relación entre el canon cobrado y la tarifa de referencia del supermercado.** […]
+Ese valor es información comercial del supermercado y **nunca se muestra al operador**,
+ni por sede ni en promedio ni sumada. Lo único que cruza es la **relación porcentual**
+[…] junto con **si el supermercado configuró o no una tarifa de referencia** (sí/no) y un
+**conteo de contratos del período a los que no les aplica ninguna tarifa**. Esta relación
+está sujeta al **mismo umbral de 3 contratos** descrito arriba […]
+
+**La lectura de adopción del servicio.** […] el operador ve, **por supermercado**:
+cuántas cuentas con membresía activa tiene, cuántas de esas cuentas entraron en los
+últimos 30 días, **cuántos días pasaron desde el último acceso de cualquiera de sus
+cuentas** —un número de días, no quién entró ni cuándo entró cada persona—, si el
+supermercado tiene contratos vigentes en el período (sí/no), el **mes de alta** […] y una
+**clasificación derivada** […] **Ninguna de estas cifras identifica a una persona** […]
+Cada consulta de adopción queda anotada […] en la bitácora de la plataforma.
@@ -341,6 +377,26 @@ (dentro del bloque de cierre [VALIDAR CON ABOGADO])
+> **[VALIDAR CON ABOGADO] — sobre las dos lecturas incorporadas después** […] la decisión
+> tomada fue **NO subir `VERSION_POLITICA`** […] Que el abogado confirme ese criterio y,
+> en particular, dos puntos: (i) […] una sola cuenta activa […]; (ii) […] información
+> comercial reservada del supermercado cliente […]
```

(El diff completo son 56 líneas por archivo; `git diff -- docs/legal/politica-datos.md`
lo muestra entero. La copia del frontend es idéntica por construcción.)

---

## 5. Para el builder — resumen accionable

1. **H-1** (`a17`, `xfail(strict=True)`): decidir entre suprimir el `spread_pct`
   consolidado con menos de 3 **clientes** aportantes, redondear el spread a entero, o
   documentar el residual en `docs/ESTADO.md` y bajar el `xfail` a caracterización.
2. **H-3** (`a19`, `xfail(strict=True)`): que la adopción distinga "base ilegible" de "no
   estaba cuando se calculó" — el arreglo es una comparación de conjuntos de slugs, sin
   migración y sin recorrer bases de más.
3. **H-2** (`a18`, ya pasa): nada urgente; el punto 2 de H-1 (redondeo a entero) lo mitiga
   de arriba si se elige ese camino.
4. La política ya declara los campos nuevos: **no la vuelvan a tocar sin copiar la fuente a
   `frontend/src/legal/` con `cp` y verificar con `cmp`** — X-21 rompe la suite si divergen.

Ningún test de otro agente fue modificado; ninguna base `backend/*.db` ajena fue borrada.
