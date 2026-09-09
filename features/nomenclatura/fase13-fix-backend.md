# Los tres hallazgos del verificador, cerrados — backend

**Fase 13 · RECABRA · 2026-09-09 · rama `claude/fase-13-nombre-unico`.**
Backend. **No se tocó una línea de `frontend/**`** ni de `docs/**`.

El verificador dejó el veredicto en verde y tres huecos. Los tres eran de lo mismo: **el
sistema sabía algo y no lo decía**. Sabía cómo se llamaba cada mueble antes de renumerar y
lo tiraba; sabía en qué se había convertido un código retirado y contestaba «no existe»;
sabía qué dos muebles chocaban y los nombraba con una llave interna que no aparece en
ninguna pantalla.

| Hallazgo | Estado |
|---|---|
| **V1** · la reconciliación se vacía justo después de renumerar | **cerrado** — el nombre viejo se guarda, en su propia tabla, y sobrevive a dos renumeraciones |
| **V4** · el código retirado se rechaza sin decir en qué se convirtió | **cerrado** — el rechazo ahora dice la fecha de la renumeración y el nombre de hoy |
| **V2 (mi mitad)** · el 409 nombra a los muebles por su `id` interno | **cerrado** — los nombra por su nombre y su rótulo |

Lo que ya pasaba sigue pasando: los 27 tests de `test_renumeracion.py` siguen verdes (ahora
son **37**), los **45** de la fase 12 también, y los **123** de diligencia sobre `PUT /layout`
y los montajes, sin tocar una expectativa. El único cambio a un test existente está
declarado abajo, con su porqué, y **es una prueba nueva más fuerte, no una más floja**.

---

## V1 · El sistema recuerda cómo se llamaba cada mueble

### El agujero

`renumeracion.py` hacía `copia.pop("nomenclatura", None)` —y tiene que hacerlo: mientras esa
`nomenclatura` esté, `layout_lookup.nombre_de_mueble` la sigue leyendo como el nombre
dibujado y una planilla escrita con el nombre nuevo saldría ambigua— pero no dejaba nada en
su lugar. `frontend/src/utils/nomenclatura.ts` busca `mueble.nombreAnterior` y su comentario
decía que «lo escribe la renumeración del servidor». No lo escribía nadie —ese comentario ya
lo corrigió el frontend en esta misma ronda, y ahora describe lo que hay—.
Resultado medido por el verificador: «Contratos para revisar uno por uno» **desaparece de la
pantalla justo después de aplicar**, que es el único momento en que hace falta.

### El remedio, y por qué éste

**Una tabla propia, `renumeracion_nombres`** (`app/models/models.py:106`), con una fila por
mueble y por corrida: sede, `fixture_id`, cómo se llamaba, qué código tenía, en qué se
convirtió y cuándo. **No un campo más en el JSON del mueble.** Las tres razones, y cualquiera
alcanza:

1. **Un segundo campo de nombre adentro del mueble es la clase entera de error que esta fase
   eliminó.** Estando ahí, tarde o temprano algo lo lee como nombre. En una tabla aparte no
   puede pasar por descuido: para usarlo hay que ir a buscarlo, y quien lo haga ve el nombre
   del módulo. **Nada resuelve contra esto**: ni la planilla (`PlanoIndexado.resolver` mira
   `code`), ni el guardarraíl, ni la búsqueda del servidor. Se lee para contar, nunca para
   elegir un mueble — y hay una prueba de eso (`test_la_planilla_vieja_dice_en_que_se_convirtio_el_codigo_retirado`:
   el nombre viejo **sigue sin resolver la fila**).
2. **Sobrevive a la segunda renumeración.** Un campo se pisa: renumerar dos veces dejaría al
   mueble recordando un nombre intermedio —uno que nunca estuvo en una pared— y el original,
   que es el que dice el papel del proveedor, perdido para siempre. Con una fila por corrida
   la cadena entera queda legible.
3. Es el **rastro de auditoría** que la operación no tenía. La bitácora anota que se renumeró
   una sede (`sede.renumerar`); esto anota qué le pasó a cada mueble.

Y `create_all` crea tablas que faltan pero nunca agrega una columna a una que ya existe: una
tabla nueva es exactamente lo que este repositorio puede desplegar sin migración, igual que
`archived_spaces`.

### Se recuerda el nombre DIBUJADO, no el código

`_anotar_nombres` (`services/renumeracion.py:826`) guarda `se_leia` —la `nomenclatura`
escrita a mano o, si no había, el código—, porque es **lo que leyó quien negoció el contrato
y lo que sigue diciendo el cartel de la góndola**. En CIUDAD JARDIN esos dos no coincidían:
el mueble `imp12` tenía el código `IMP-12` y el plano lo dibujaba «IMP-08». Guardar el código
habría recordado un nombre que nadie vio nunca.

El mueble que sale llamándose igual que entró **no deja fila**: no hay nada que recordar, y
una fila de más ensuciaría la lista de la pantalla. En el plano de prueba de NAVE, 20 muebles
cambian de código y **17** dejan memoria: los tres impulsadores ya se dibujaban con el nombre
que les tocaba.

### Se contesta la punta más vieja de la cadena, y es una decisión

`nombres_anteriores(db, sedes)` (`renumeracion.py:854`) devuelve
`{sede: {id del mueble: cómo se llamaba antes}}` tomando **la fila más vieja** de cada mueble,
no la penúltima. Lo que la pregunta busca no es «cómo se llamaba ayer» sino **«qué dice el
papel que tengo en la mano»**, y el papel y la cartelería traen el nombre de antes de que el
sistema empezara a moverlo. El intermedio de una segunda corrida hecha la misma semana no
estuvo nunca en una pared. La cadena completa queda igual en la tabla, para quien algún día
quiera mostrarla entera.

> **Para el frontend:** `utils/nomenclatura.ts:142-155` ya describe esto exacto —la tabla, la
> proyección, la punta más vieja—, así que las dos puntas dicen lo mismo. Lo que quedó
> desfasado es `types/fixtures.ts:402`, que sigue diciendo «antes de la **última**
> renumeración»: con una sola corrida es lo mismo, con dos esto devuelve el ORIGEN. Vale
> corregir ese comentario; el archivo no es mío.

### Cómo llega a la pantalla: derivado al leer, sacado al escribir

El frontend lee `mueble.nombreAnterior` y los dos editores lo arrastran. Entonces el campo
viaja en la respuesta, **pero no se guarda en el mueble**:

| | Dónde | Qué hace |
|---|---|---|
| Al leer | `routers/layout.py:179` `_con_nombre_viejo` | agrega `nombreAnterior` a cada mueble que se llamaba distinto, en `GET /layout/`, `GET /layout/{sede}` y en la respuesta del `PUT` |
| Al escribir | `routers/layout.py:203` `_sin_nombre_viejo` | lo saca de lo que llega a guardarse |

Es toda la diferencia entre un recuerdo y un segundo nombre: **el JSON del plano sigue
teniendo un solo nombre**. El editor lo devuelve en el guardado siguiente —hace bien: no es
suyo— y el servidor lo descarta; si se guardara, quedaría una copia que la próxima
renumeración no actualiza y un campo que alguien puede leer como identidad. Probado contra la
base, no contra la respuesta (`test_el_nombre_viejo_no_se_guarda_en_el_plano`): el
`fixtures_json` guardado no tiene la clave, ni siquiera después de que el cliente mande un
`nombreAnterior` **inventado**.

Sólo se agrega cuando difiere del nombre de hoy: un mueble que salió llamándose como entró no
tiene nada que recordar, y la clave de más sería ruido en cada plano que baja.

### Medido, sobre el caso del dueño

CIUDAD JARDIN tal cual: 11 impulsadores `IMP-07…IMP-17`, tres puntas y **los seis nombres
puestos a mano que pisan el código de otro**, con el contrato de CASA LUKER cargado sobre
`imp12` antes de renumerar. Después de aplicar, contra `GET /api/layout/CIUDAD JARDIN`:

```
imp7 : code='IMP-01' nombreAnterior='IMP-07'   nomenclatura=(no está)
imp8 : code='IMP-02' nombreAnterior='IMP-08'   nomenclatura=(no está)
imp9 : code='IMP-03' nombreAnterior='IMP-17'   nomenclatura=(no está)
imp12: code='IMP-06' nombreAnterior='IMP-08'   nomenclatura=(no está)
pun6 : code='PUN-01' nombreAnterior='PUN-06'   nomenclatura=(no está)
```

`imp12` —el mueble que se negoció mirando el cartel «IMP-08» y cuyo código era `IMP-12`—
recuerda **«IMP-08»**, que es exactamente el dato con el que el frontend arma
*«CIUDAD JARDIN-IMP-06 · se negoció como «IMP-08»»*.

**Y el otro extremo del cable está medido, aunque no por mí.** El constructor de frontend
trabajó en paralelo contra este código —no contra el contrato que él suponía, que era un
endpoint aparte: lo dice en su §2.1 de `fase13-fix-frontend.md`— y levantó la app para mirar la
pantalla: la lista «Contratos para revisar uno por uno» **sigue mostrando sus cuatro contratos
después de aplicar**, con el nombre viejo y el nuevo. La consecuencia de que la memoria baje
proyectada sobre el mueble es que el frontend **no tuvo que pedir nada**: borró el cliente del
endpoint que ya había escrito y `api/layout.ts` quedó sin tocar.

Que dos muebles recuerden «IMP-08» no es un error: el plano viejo **dibujaba dos muebles con
ese nombre**, que es de lo que se trataba, y la lista los va a mostrar a los dos.

---

## V4 · El código retirado dice en qué se convirtió

`Rastreador.pista(sede, texto)` (`renumeracion.py:903`), llamado desde
`routers/bulk_leases.py:329`, agrega **un renglón más** al rechazo. La fila **sigue en error**:
adivinar el mueble es el error que esta fase eliminó, y quien mande la planilla tiene que
escribir el nombre de hoy a propósito. Lo que cambia es que ya no se lo deja adivinando por
qué, y después de renumerar **cada planilla vieja de la casa cae en ese renglón**.

Medido sobre el plano renumerado de CIUDAD JARDIN, con `CIUDAD JARDIN-IMP-17`:

```
· No hay ningún mueble con el código «CIUDAD JARDIN-IMP-17» en el plano de CIUDAD JARDIN.
· Ese plano se renumeró el 9 de septiembre de 2026: «IMP-17» lo llevaban 2 muebles, que
  ahora se llaman «IMP-03» y «IMP-11». Escribí el que corresponda.
```

Ahí se ve la parte fina: en el plano del dueño **«IMP-17» lo llevaban dos muebles** —era el
código de uno y el nombre escrito a mano de otro—, así que no hay una sola respuesta y no se
elige. Cuando sí la hay, la frase es la corta: *«…«PUN-09» ahora se llama «PUN-02».»*

Tres decisiones del rastro:

- **Se busca por los dos nombres**, el código viejo y el dibujado, porque una planilla vieja
  puede traer cualquiera de los dos: el de la base o el del cartel. Acepta el código
  completo, el corto y la cara `-B`.
- **El «ahora» se lee del plano de hoy**, siguiendo al mueble por su `id`, y no de la última
  fila de la tabla. Así la respuesta también es cierta cuando el mueble se renumeró dos veces
  **o cuando alguien lo renombró a mano después** — probado con los dos saltos.
- **Si el mueble ya no está en el plano se dice eso**, en vez de mandar a la persona a buscar
  un nombre que tampoco existe.

Y el registro se lee **una vez por planilla**, no una por fila: una planilla de trescientas
filas que no resuelven serían seiscientas consultas, que es exactamente lo que
`PlanoIndexado` existe para no hacer. El `Rastreador` no lee nada hasta que alguna fila
pregunte, así que una planilla sana no paga un solo `SELECT` de más.

El mensaje se agrega también cuando el código existe en OTRA sede. Ahí la frase vieja
—«sí existe en NAVE»— es la más peligrosa que hay: manda un contrato al supermercado
equivocado. Las dos juntas dejan elegir con criterio.

---

## V2 · El 409 nombra a los muebles por su nombre

`choques_nuevos` decía «(imp9, pun8)». Un `id` es una llave interna: no aparece en el plano,
ni en el panel, ni en un contrato, ni en el papel que se lleva a la tienda. Nombrar el choque
con eso es tan útil como no nombrarlo.

Ahora los nombra por **lo que la persona ve en la pantalla**: el nombre que el plano
**guardado** dibuja hoy, con su rótulo al lado (`_como_se_ven`, `layout_lookup.py:596`).
Antes y después, textual:

```
ANTES  «PUN-06» quedaría como nombre de 2 muebles de la sede (imp9, pun8). Dos muebles con
       el mismo nombre no se distinguen en el plano ni en un contrato.

AHORA  «PUN-02» quedaría como nombre de 2 muebles de la sede: el que hoy se llama «PUN-01»
       (Punta de Gondola) y el que hoy se llama «PUN-02» (Punta de Gondola). Dos muebles con
       el mismo nombre no se distinguen en el plano ni en un contrato.
```

Dos detalles que no son cosméticos:

- **Un mueble que este guardado agrega** no se puede nombrar «el que hoy se llama»: hoy no se
  llama nada, porque no está. Se dice *«el que se agrega en este guardado, «GON-02» (Punta de
  Góndola)»*. Probado.
- **Dos muebles que hoy se dibujan igual** —un choque que ya venía— se describen con la misma
  frase, y repetirla palabra por palabra se lee como un error de la aplicación. Se dice una
  vez: la cuenta ya va en el encabezado del mensaje.

Los `id` no se perdieron: el rechazo **queda en el registro del servidor**
(`routers/layout.py:663`), que es donde se mira cuando alguien pregunta qué pasó. En la
pantalla va el nombre; en el log, la frase entera.

El contrato con el frontend no cambió: `409` con `detail = {code: "nombres_repetidos",
message, choques: [...]}`, frases completas listas para mostrar. `fixtureStore` las muestra
tal cual y no hubo que tocar nada.

**La otra mitad de V2 no es mía**: que la pantalla no pinte ese rechazo como «Sin conexión»
—el chip rojo con la nube tachada y el mensaje escondido en un `title=`— es del frontend.

---

## Lo que NO cambió, a propósito

- **Los invariantes.** `verificar_invariantes` sigue comparando el plano guardado contra el
  calculado con `CAMPOS_QUE_PUEDEN_CAMBIAR = ("code", "nomenclatura")`: la memoria **no entra
  al plano**, así que no hubo que aflojar esa lista ni una coma.
- **El previo no escribe una sola fila**, tampoco en la tabla nueva. La prueba de siempre lo
  compara ahora también contra el registro (`test_el_previo_no_escribe_una_sola_fila`).
- **La idempotencia.** Una sede donde nada cambia no se toca y no deja filas: la segunda
  corrida sigue sin mover ni `updated_at`.
- **El arrastre, los dos UNIQUE, la rotación pura, los bloqueos, el informe imprimible**: sin
  tocar.
- **`bulk_leases.py`** sólo suma el renglón de la pista; la resolución de la planilla es la
  misma.

### El único test existente que cambió

`test_no_se_mueve_una_sola_coordenada` compara la respuesta de `GET` campo por campo antes y
después de renumerar. Ahora se saltea también `nombreAnterior`, **y a cambio hay una prueba
más dura**: `test_el_nombre_viejo_no_se_guarda_en_el_plano` lee el `fixtures_json` **de la
base** y afirma que la clave no está — que es el invariante de verdad («esto es el mismo plano
con otros nombres»), medido donde vive el plano y no donde vive la respuesta. La docstring del
test viejo apunta al nuevo.

---

## Qué se probó

`backend/tests/test_renumeracion.py`: **27 → 37 pruebas**. Las diez nuevas:

| Lo que pide el encargo | Prueba |
|---|---|
| Después de renumerar se puede reconstruir el nombre viejo de cada mueble | `test_despues_de_renumerar_se_puede_reconstruir_el_nombre_viejo_de_cada_mueble` — mueble por mueble contra el informe, por `GET /{sede}` y por el pull de todas las sedes; y el que no cambió de nombre no recuerda nada |
| La memoria sobrevive a dos renumeraciones seguidas | `test_la_memoria_sobrevive_a_dos_renumeraciones_seguidas` — con un renombre a mano en el medio: devuelve el ORIGINAL, no el intermedio, y la cadena de dos filas queda entera en la base |
| (que no sea un segundo nombre) | `test_el_nombre_viejo_no_se_guarda_en_el_plano` — el JSON guardado no lo tiene, ni cuando el cliente manda uno inventado |
| (que el que camina la tienda lo vea, y nada más) | `test_el_operario_tambien_ve_el_nombre_viejo_y_sigue_sin_ver_la_plata` |
| El mensaje del código retirado dice en qué se convirtió | `test_la_planilla_vieja_dice_en_que_se_convirtio_el_codigo_retirado` — y la fila **sigue en error** |
| …y después de dos renumeraciones, y de un renombre a mano | `test_la_pista_sigue_los_dos_saltos_y_lee_el_plano_de_hoy` |
| …y cuando no hay una sola respuesta | `test_cuando_ese_nombre_lo_llevaban_dos_muebles_la_pista_no_elige` |
| …y cuando el mueble ya no está | `test_la_pista_no_inventa_un_mueble_que_ya_no_esta` |
| El 409 nombra por nombre | `test_el_409_nombra_a_los_muebles_por_su_nombre_y_no_por_su_id` — los dos nombres y los dos rótulos están, y **ningún `id`** |
| …y el mueble que se agrega en el guardado | `test_el_mueble_que_agrega_el_guardado_se_nombra_como_lo_que_es` |

```
pytest tests/test_renumeracion.py                                   → 37, exit 0
pytest tests/test_bulk_leases.py tests/test_nomenclatura_planilla.py → 45, exit 0   (la fase 12, sin tocar una expectativa)
pytest tests/test_contract_emails.py tests/test_files_acceso.py tests/test_derechos.py
       tests/test_sede_delete.py tests/test_mounts.py tests/test_bitacora.py
       tests/test_montaje_enlace.py                                  → 123, exit 0
pytest, archivo por archivo, los otros once que tocan /api/layout:
       test_asesoria_ataques · test_auditoria_hardening · test_auditoria_ingresos ·
       test_clientes · test_detalle_ataques · test_identidad · test_landing ·
       test_metricas_ataques · test_plataforma_ataques · test_plataforma_metricas ·
       test_plataforma_spread                                        → los once, exit 0
```

Los últimos once son **todos** los archivos de prueba que tocan `/api/layout` y que no estaban
ya en las listas de arriba: es lo que puede ver la proyección de lectura y la limpieza del
guardado. Van **uno por uno a propósito**, y esto hay que decirlo entero: corridos **juntos en
una misma invocación** fallan, y **fallan igual sin una línea mía**. Lo medí sobre el árbol de
`HEAD` —o sea antes de toda la fase 13— con la misma lista y el mismo comando:

```
mi árbol, los once juntos     →  8 fallas   (todas en test_plataforma_metricas.py)
HEAD, los once juntos         → 34 fallas   (en seis archivos distintos)
test_clientes + test_plataforma_metricas, juntos:   falla en los DOS árboles
cada archivo solo:            → verde, en los dos
```

Es un problema de aislamiento entre archivos que ya estaba —`conftest` purga los módulos de
`app` entre pruebas y el registro de clientes guarda motores— y que ni empeoré ni arreglé:
está fuera de este encargo, pero queda anotado abajo. No se corrió la suite completa ni
`npm run build`, como pide la regla de verificación.

Y de punta a punta, con el caso del dueño sembrado (`/tmp/f13b/caso_dueno.py`, fuera del
repo): contrato cargado, renumeración aplicada, `nombreAnterior` en su lugar, la planilla
vieja con su pista y el 409 con los nombres. La salida está transcrita arriba.

**`npx tsc --noEmit` no lo corrí, y es a propósito**: no toqué un solo archivo de
`frontend/**`, y el constructor de frontend está editando ese árbol en paralelo en esta misma
rama —`SyncStatus.tsx`, `revision.ts` y su informe aparecieron mientras yo trabajaba—, así que
lo que informara sería de él y no mío. Su informe trae su propio `tsc` en verde.

---

## Archivos

| Archivo | Qué |
|---|---|
| `backend/app/models/models.py` | **Tabla nueva** `renumeracion_nombres` (`RenumeracionNombre`), con el porqué de que sea una tabla |
| `backend/app/services/renumeracion.py` | `_anotar_nombres` (escribe la memoria dentro de la misma transacción), `nombres_anteriores` (la consulta de la reconciliación), `Rastreador` + `pista_de_renumeracion` (V4), y la sección «LA MEMORIA» del encabezado |
| `backend/app/routers/layout.py` | `_con_nombre_viejo` / `_sin_nombre_viejo` y sus tres llamadas; el registro del rechazo del guardarraíl |
| `backend/app/services/layout_lookup.py` | `_como_se_ven` / `_nombrados` / `_y` y la nueva redacción de `choques_nuevos` (V2) |
| `backend/app/routers/bulk_leases.py` | El renglón de la pista en el rechazo del código que no existe (V4), con el registro leído una vez por planilla |
| `backend/tests/test_renumeracion.py` | 10 pruebas nuevas; una existente ajustada, con su reemplazo más fuerte |
| `backend/app/schemas/layout.py`, `backend/app/models/` (el resto) | **Sin tocar** — la memoria no viaja en el esquema de la renumeración, viaja en el mueble como campo derivado |

**Sin librerías nuevas, sin migración, sin commit ni push. `frontend/**` sin tocar.**

---

## Lo que queda abierto

1. **`docs/ESTADO.md`** sigue sin actualizar, como declararon los tres constructores y el
   verificador. Lo de esta ronda que hay que pegar ahí, en §«Renumerar»:

   > **El sistema recuerda cómo se llamaba cada mueble.** Renumerar es lo único que cambia el
   > nombre de un mueble sin que nadie lo teclee, y hay dos cosas que no se enteran: el papel
   > que firmó el proveedor y el cartel de la góndola. Cada corrida deja escrito, mueble por
   > mueble, el nombre que el plano **dibujaba** antes (tabla `renumeracion_nombres`), y de ahí
   > sale «Contratos para revisar uno por uno» **después** de renumerar, que es cuando hace
   > falta. No es un segundo nombre: vive en su propia tabla, nada resuelve contra ella, el
   > JSON del mueble sigue teniendo un solo nombre —el servidor agrega `nombreAnterior` al
   > leer y lo saca al escribir— y una segunda renumeración agrega una fila en vez de pisar la
   > anterior, así que la cadena entera queda legible. Con eso, además, una planilla vieja que
   > nombra un código retirado ya no se rechaza en seco: se le dice en qué se convirtió.

2. **La memoria de una sede borrada no se borra.** Considerado y decidido así: es historia,
   como `archived_spaces.original_code` y como la bitácora, y borrarla no arregla nada. Una
   sede recreada con el mismo nombre no la hereda en la práctica —los `id` de mueble llevan
   `Date.now()` adentro (`FloorPlan2D.tsx:846`), así que no se repiten—, pero si algún día los
   `id` pasan a ser deterministas hay que limpiarla en `delete_layout`, junto al archivado de
   espacios.
3. **Los enlaces de montaje ya emitidos** siguen rompiéndose con la renumeración: el código va
   firmado adentro del token (`auth.py:337`). Sin cambios desde la fase 12.
4. **Nada de esto se corrió contra los planos de producción** —no están en el repo—. El previo
   existe para eso: hay que abrirlo contra la base real y leer el informe sede por sede antes
   de aplicar. La tabla nueva se crea sola en el arranque (`create_all`) y arranca vacía: en un
   plano que nunca se renumeró, la reconciliación sigue saliendo de la `nomenclatura`, como
   hoy.
5. **V3** (la columna CORRIDA del papel que mete una caja adentro de un pasillo) y **V5** (los
   gemelos que ya no se distinguen en el rótulo) no eran de este encargo. V3 sigue abierto y es
   cosmético; V5 el verificador ya lo declaró correcto.
6. **Los archivos de prueba de la plataforma no se aíslan entre sí.** Corridos juntos en una
   misma invocación de pytest se pisan —`conftest` purga los módulos de `app` entre pruebas y
   el registro de clientes se queda con motores de la anterior— y fallan pruebas que solas
   pasan. **Ya pasaba antes de la fase 13**, medido sobre `HEAD` (§«Qué se probó»), así que no
   lo trajo esta rama; pero es una trampa para el próximo que corra la suite por partes y para
   cualquiera que quiera paralelizarla. Hay que arreglarlo alguna vez, y no acá.

## Higiene

- **No se levantó ningún servidor**: todo se midió con el `TestClient` de la suite, así que no
  hubo puertos que abrir ni que matar. `TMPDIR=/tmp/f13b/tmp` y el arnés de punta a punta en
  `/tmp/f13b/`, los dos **fuera del repo**; las bases son archivos temporales que la propia
  suite borra. `find` sobre `/tmp/re-nom` no encuentra un `.db`, un `.sqlite` ni un `.pid`.
- Sin `npm install`, sin librerías nuevas, **sin commit ni push**. El árbol quedó con los
  mismos archivos que traía: cinco modificados por mí (`models.py`, `renumeracion.py`,
  `layout.py`, `layout_lookup.py`, `bulk_leases.py`), más `test_renumeracion.py` y este
  informe.
