# Un solo nombre: el código pasa a ser EL nombre — backend

**Fase 13 · RECABRA · 2026-09-08 · rama `claude/fase-13-nombre-unico`.**
Backend. No se tocó una línea de `frontend/**`.

La fase 12 **administró** el problema de los dos nombres: rechazó el texto ambiguo, avisó
del gemelo, pintó la colisión en el plano y en el mapa de Vender. Lo que no pudo fue
eliminarlo, y lo dijo con todas las letras (`DIAGNOSTICO.md` §5, `docs/ESTADO.md`
§«Lo que esta fase NO hace, y por qué»): mover el `code` arrastra `spaces.code` y
`spaces.svg_id` —los dos UNIQUE—, `mount_confirmations.space_code`, los enlaces de montaje
y el histórico.

El dueño dijo que **los contratos cargados son de prueba**. Entonces esa mudanza ya se
puede pagar, y lo que se hace es lo otro: **el `code` pasa a ser EL nombre y la
`nomenclatura` deja de existir como segundo nombre**. Con un solo campo, «el nombre que se
lee» y «la llave que une» no se pueden separar. La clase entera de error desaparece en vez
de quedar vigilada.

---

## 1. La regla de recorrido, y por qué es ésa

> **`PREFIJO-NN`. Se agrupa en bandas sobre el eje PERPENDICULAR al que se camina, las
> bandas se numeran de menor a mayor, y adentro de cada banda se ordena de menor a mayor
> sobre el eje que se camina. El eje que se camina es aquel sobre el que se extienden los
> muebles alargados del plano; si no hay ninguno, es la dimensión MENOR del recinto. Un
> solo recorrido para toda la sede, y un contador por prefijo.**

**No es una corazonada, y no hace falta creerme: ya estaba medido.**
`frontend/src/utils/pasillos.ts` deduce las corridas de NAVE agrupando por la coordenada
perpendicular al eje largo de las góndolas, y `docs/ESTADO.md` §«Pasillos» registra el
resultado: *«el resultado coincide con lo que hizo la persona a mano: nueve de las diez
corridas calzan exactamente con los códigos existentes»*. O sea que quien numeró el plano
de NAVE **caminó pasillo por pasillo**, y la agrupación por la perpendicular reproduce lo
que hizo. Copiar eso es más honesto que inventar una regla nueva y esperar que coincida.

Las cuatro piezas, cada una con su porqué:

**1. El eje que se camina — por el voto de los muebles alargados.** Se mide la huella YA
GIRADA (`rotY` aplicado, el mismo `_huella` que usa el correo de montaje y el detalle por
cliente) y se cuenta cuántos muebles se estiran sobre X y cuántos sobre Z. Una góndola de
3,60 × 0,90 girada un cuarto de vuelta se estira sobre Z y vota Z; una caja de 1,80 × 0,70
sin girar vota X. Gana la mayoría. Sólo votan los que son al menos **1,5 veces** más largos
que anchos: un impulsador de 0,60 × 0,50 no apunta a ningún lado y su voto sería ruido.

**2. Si no hay alargados, la forma del recinto.** Se camina la dimensión **menor**. Es la
forma que tiene un supermercado, y NAVE lo confirma con números: 42,4 × 15,8 m, con las
**diez** corridas repartidas sobre los 42,4 m de X y cada una recorrida sobre los 15,8 m de
Z. Muchos pasillos a lo ancho, cada uno caminado a lo largo del lado corto. Los dos
criterios dan lo mismo en NAVE, que es la señal de que ninguno es arbitrario.

**3. Las bandas, con la tolerancia que ya se midió.** `TOLERANCIA_BANDA = 0,6 m`, el mismo
encadenado y el mismo número de `detectarCorridas`. Dos góndolas de la misma corrida
comparten `cx` aunque estén a diez metros una de otra sobre el eje largo; 0,6 m es lo que
tolera el ruido de un plano medido a mano sin fundir dos pasillos, que en un plano real
están a 1,3–2,8 m (§«Revisar antes de negociar»).

**4. Un solo recorrido, un contador por prefijo.** La promesa es «caminar la tienda y leer
los números en el mismo orden», y eso sólo vale si hay UN recorrido: si cada tipo se
ordenara por su cuenta, los GON subirían en un sentido y los PUN en otro. El prefijo sale
de `PREFIJO_POR_TIPO`, **espejo exacto** de `frontend/src/utils/nomenclatura.ts`, con una
prueba que lee el archivo `.ts` y compara tabla contra tabla — si se separan, el sistema
vuelve a mentir.

**Determinista y estable.** Los empates se rompen por la coordenada de banda y después por
`id`. Dos corridas sobre el mismo plano dan exactamente el mismo orden, hasta el orden de
las filas del informe. Está probado (`test_el_recorrido_es_determinista_y_estable`): sin
esto el papel que el dueño imprime diría algo distinto cada vez que lo pide.

### El antes → después de un plano de ejemplo

Plano de prueba con la geometría real medida en NAVE: tres corridas de góndolas de 3,60 ×
0,90 giradas 90° (se extienden sobre Z), con sus puntas en cabecera y cola, una fila de
cajas al frente y una de impulsadores. Los nombres vienen **corridos a propósito**: las
nueve góndolas llevan los nueve códigos `GON-01…GON-09` pero puestos una posición más
adelante, así que renumerar es una **rotación pura** — cada mueble toma el nombre que otro
deja. Salida literal de `POST /api/layout/renumeracion/previo`:

```
RENUMERACIÓN · NAVE

Recorrido: 8 bandas sobre X, y dentro de cada banda de menor a mayor Z.
Eje elegido: 9 muebles alargados corren sobre Z y 3 sobre X: los pasillos van sobre Z.
21 muebles · 20 cambian de nombre · 0 se agregan · 0 se borran.

BANDA  ANTES          SE LEÍA        AHORA                X       Z  MUEBLE
--------------------------------------------------------------------------------------
    1  IMP-03         IMP-01         IMP-01            1.00   15.00  Impulsador Marca
    2  IMP-01         IMP-02         IMP-02            2.00   15.00  Impulsador Marca
    3  IMP-02         IMP-03         IMP-03            3.00   15.00  Impulsador Marca
    4  PUN-06         PUN-06         PUN-01            4.00    1.00  Punta de Góndola
    4  GON-02         GON-02         GON-01            4.00    3.00  Góndola Doble
    4  GON-03         GON-03         GON-02            4.00    7.00  Góndola Doble
    4  GON-04         GON-04         GON-03            4.00   11.00  Góndola Doble
    4  PUN-05         PUN-05         PUN-02            4.00   13.00  Punta de Góndola
    5  CAJ-03         CAJ-03         CAJ-01            5.00   17.00  Caja
    6  CAJ-02         CAJ-02         CAJ-02            6.50   17.00  Caja  (igual)
    7  PUN-04         PUN-04         PUN-03            8.00    1.00  Punta de Góndola
    7  GON-05         GON-05         GON-04            8.00    3.00  Góndola Doble
    7  GON-06         GON-06         GON-05            8.00    7.00  Góndola Doble
    7  GON-07         GON-07         GON-06            8.00   11.00  Góndola Doble
    7  PUN-03         PUN-03         PUN-04            8.00   13.00  Punta de Góndola
    7  CAJ-01         CAJ-01         CAJ-03            8.00   17.00  Caja
    8  PUN-02         PUN-02         PUN-05           12.00    1.00  Punta de Góndola
    8  GON-08         GON-08         GON-07           12.00    3.00  Góndola Doble
    8  GON-09         GON-09         GON-08           12.00    7.00  Góndola Doble
    8  GON-01         GON-01         GON-09           12.00   11.00  Góndola Doble
    8  PUN-01         PUN-01         PUN-06           12.00   13.00  Punta de Góndola

Se descartan 3 nombres escritos a mano: el nombre del mueble pasa a ser su código, y hay uno solo.
```

Se lee entero de un vistazo, y las tres columnas de nombre dicen tres cosas distintas:
**ANTES** es el código que tenía, **SE LEÍA** es lo que el plano dibujaba (la nomenclatura
escrita a mano, cuando la había) y **AHORA** es el nombre único. En los tres impulsadores
se ve el caso del dueño en su forma más pura: la persona había escrito a mano los nombres
correctos —`IMP-01`, `IMP-02`, `IMP-03`, de izquierda a derecha— y los códigos decían otra
cosa. Después de esto, el código dice lo que la persona escribió, y hay uno solo.

Las corridas se numeran de izquierda a derecha (bandas 4, 7, 8) y cada una se lee de
adelante hacia el fondo (`PUN-01`, `GON-01`, `GON-02`, `GON-03`, `PUN-02`). Caminar y leer
van en el mismo orden, que era la promesa.

---

## 2. Los invariantes, afirmados en el código

En `services/renumeracion.py::verificar_invariantes`, que corre **antes de escribir una
sola fila** —en el previo y otra vez adentro del aplicar, esta segunda vez contra lo que
está guardado en ese momento— y que si falla aborta la operación entera:

| Promesa | Cómo se afirma |
|---|---|
| Ningún mueble se agrega ni se borra | `len(antes) == len(después)` y `set(id) == set(id)`, con los ids que faltan y los que sobran nombrados |
| No cambia una sola coordenada | Se comparan **todos** los campos de cada mueble; los únicos dos que pueden diferir son `code` y `nomenclatura` (`CAMPOS_QUE_PUEDEN_CAMBIAR`). Cualquier otra diferencia —`cx`, `rotY`, `rentable`, el color— aborta |
| Dos muebles no pueden quedar con el mismo nombre | Los códigos nuevos se cuentan y se exige que sean únicos |

Comparar **todos** los campos y no sólo `cx`/`cz` es a propósito: el invariante que importa
no es «las coordenadas», es «esto es el mismo plano con otros nombres». Un `rentable` que
se dé vuelta sacaría un mueble de la venta sin que nadie lo pida.

Y hay dos bloqueos que no son fallas del cálculo sino del plano, con mensaje que nombra el
problema para que una persona lo arregle (`RenumeracionBloqueada`, HTTP 409):

- **Un mueble sin `id`.** Sin identidad no se puede afirmar que después es el mismo mueble,
  y sin poder afirmarlo la promesa no se puede cumplir. Se para antes de tocar nada.
- **Dos muebles que comparten `id`.** Lo mismo.

Probado que **frena de verdad**: `test_el_invariante_frena_la_escritura_y_no_deja_nada_a_medias`
fuerza el fallo desde adentro (parchea `codigos_nuevos` para que pierda un mueble) y
comprueba que la respuesta es 500, que el plano guardado queda idéntico y que hasta
`updated_at` sigue igual.

---

## 3. El arrastre: qué se muda y qué no

**Los dos UNIQUE, en dos pasadas dentro de UNA transacción.** Renumerar es casi siempre una
**permutación**: el nombre que deja uno lo toma otro. Escribiendo fila por fila, la primera
choca contra la que todavía no se movió. Entonces todas las filas afectadas van primero a
un valor imposible (`~renum~<id>~code` / `~renum~<id>~svg`), se hace `flush`, y recién
después al definitivo. Nadie ve nunca el estado intermedio.

Probado con el caso que hace fallar la escritura ingenua
(`test_una_rotacion_pura_de_nombres_se_aplica_sin_chocar`): **nueve góndolas con contrato
encima que se pasan el nombre en círculo**. Al final el conjunto de nombres es el mismo,
ningún mueble se quedó con el suyo y las nueve filas de `spaces` siguen siendo nueve.

| Qué | Se arrastra | Por qué |
|---|---|---|
| `spaces.code` | **Sí** | Es la llave del contrato. Incluye la cara `-B` de la góndola doble, que se conserva |
| `spaces.svg_id` | **Sí**, cuando se deriva del código | Hay dos formas de fabricarlo en el repo: el código pelado (`bulk_leases.py`) y `fix-CODIGO` (`spaces.py`, `mounts.py`). Un `svg_id` **sembrado a mano** (`lic-24h`, `arroz-centro`) no se deriva del código y no se toca |
| `spaces.name` | **Sí**, sólo cuando ES el código | `mounts.py` crea el espacio con `name=code`. Cuando `name` es un rótulo de verdad —«Punta Góndola»— no se toca: alguien lo escribió a propósito |
| `mount_confirmations.space_code` | **Sí** | Guarda el código como texto suelto y a propósito (un montaje se confirma antes de que exista la fila en `spaces`), así que hay que mudarlo a mano. Es la prueba de que la exhibición se armó |
| `space_files`, `space_faces`, `lease_files`, `space_leases`, `notification_logs` | **No hace falta** | Todas cuelgan de `space_id` (FK). Se mudan gratis |
| `archived_spaces.original_code` | **No** | Es el nombre que el espacio **tenía cuando se archivó**. Reescribirlo sería falsificar el registro: existe justamente para que la historia se pueda leer |
| `audit_log` (bitácora) | **No** | Misma razón: dice qué se hizo **entonces** |
| Confirmaciones de montaje **archivadas** | **No** | Pertenecen a una sede borrada; son historia congelada |
| `spaces` con **código corto** (sin sede) | **No, y se avisa** | Es el agujero que la fase 12 tapó hacia adelante. Un código sin sede no dice de qué tienda es: arrastrarlo podría mandar un contrato al supermercado equivocado. Aparece como `aviso` en el informe, con el mueble que se renumera nombrado, para que una persona lo resuelva |

**Dos bloqueos más, del lado de la base** (409, nada escrito):

- **Un espacio que ocupa el nombre destino y no se mueve.** Pasa de verdad: se borra un
  mueble del plano después de contratarlo y la fila comercial sobrevive —es historia, y
  está bien que sobreviva—. Si la renumeración le diera ese nombre a otro mueble, el
  contrato del borrado quedaría colgado del mueble equivocado. Se para todo y se dice cuál
  es el espacio. Es más barato archivarlo a mano que descubrir un mes después que dos
  contratos comparten historia.
- **Dos muebles con el mismo código y un espacio colgando de él.** No hay forma honesta de
  decir de cuál de los dos es el contrato. Se bloquea **sólo si el espacio existe**: si no
  existe, renumerar es justamente lo que arregla el duplicado, y se hace.

**Lo que se rompe, dicho de frente: los enlaces firmados de montaje ya emitidos.** El token
de `create_mount_token` (`auth.py:337`) lleva el código **adentro**, así que un enlace
mandado antes de renumerar apunta a un nombre que ya no existe. No hay forma de arrastrarlo
—está firmado— y vencen solos a los `MONTAJE_TTL_DAYS`. La verificación de la fase 12 dejó
esto anotado como «sin confirmar» (si alguna vez se emitieron en producción). Si se
emitieron, hay que reenviarlos después de renumerar.

---

## 4. Los dos pasos

Como la carga masiva, y por la misma razón: **el previo no escribe nada**.

| | |
|---|---|
| `POST /api/layout/renumeracion/previo` | Devuelve el antes → después de cada sede. **No escribe una sola fila** — probado comparando el plano, su `updated_at`, los espacios con su `svg_id` y las confirmaciones de montaje |
| `POST /api/layout/renumeracion/aplicar` | Escribe el plano, los espacios y los montajes, **todo en una transacción**, con la bitácora adentro (`sede.renumerar`): o cae todo o no cae nada |

Los dos son de admin (`403` para worker, probado), y los dos aceptan `{"sedes": [...]}` o
`{}`. **Sin `sedes` van TODAS**, que es lo que el dueño eligió: «en todas las sedes,
parejo» — se normaliza el plano completo aunque hoy no tenga conflicto, para que la
numeración quede con la misma lógica en todas.

`aplicado` viaja en la respuesta (`false` en el previo, `true` en el aplicar). Evita la
peor confusión posible de esta pantalla: creer que ya se aplicó.

**El informe es parte del backend, no del navegador.** Cada sede trae un campo `texto` con
la tabla de arriba en texto plano, listo para imprimir. Va acá y no sólo en la tabla de la
pantalla porque **es lo que el dueño se lleva a la tienda**: se imprime, se camina el local
y se tacha. Sin ese papel, renumerar le deja el plano y la cartelería hablando idiomas
distintos.

**Idempotente**: la segunda corrida vuelve a calcular lo mismo, no encuentra nada que
cambiar y **no escribe** — ni siquiera mueve `updated_at`, que es lo que los otros equipos
usan para saber que algo cambió; moverlo sin que nada haya cambiado los manda a descargar
un plano idéntico y entrena a ignorar el aviso.

---

## 5. El guardarraíl de servidor (F7, que la fase 12 dejó abierto)

`PUT /layout/{sede}` aceptaba la lista de muebles **sin mirar**, así que la prohibición de
crear un nombre que pisa el de otro vivía **sólo en el navegador**. Un guardarraíl que vive
en el cliente no es del sistema: basta otra pantalla, un script o una versión vieja para
saltarlo.

La regla ahora es del servidor y está en `layout_lookup.choques_nuevos`:

> **No se rechazan los choques: se rechazan los choques NUEVOS**, comparando contra el
> snapshot anterior. Se comparan **cuentas**, no pares.

Comparar cuentas es lo que hace que renumerar a mano siga siendo posible:

- **Intercambio** (A toma el nombre de B y B el de A): la cuenta de cada nombre sigue en 1.
  **Pasa.** Probado.
- **Cadena de tres** (A toma el de B, B el de C, C el de A): igual. **Pasa.** Probado.
- **Choque nuevo** (B se renombra al nombre de A): la cuenta de ese nombre sube de 1 a 2.
  **Se rechaza**, con 409 `nombres_repetidos` y el detalle diciendo qué nombre y en qué
  muebles.
- **Choque preexistente** (el plano ya tenía dos `IMP-08`): la cuenta no sube. **Se
  guarda.** Es la regla que no se negocia: el plano que ya está mal se abre, se mueve y se
  guarda. Probado moviendo un mueble de un plano sucio.
- **Un plano que entra por PRIMERA vez** (no hay snapshot con qué comparar): **entra**. Así
  llega un plano existente —el arranque, la sincronización desde otro equipo, una
  restauración— y trabarlo ahí lo haría inimportable, no más seguro. Es también lo que hace
  que las 45 pruebas de la fase 12 sigan sembrando su plano sucio sin cambiar una línea.

Se miran **dos** cosas con la misma regla, porque son dos daños distintos: el **nombre
dibujado** (dos muebles con el mismo rótulo no se distinguen en el plano — el error de la
fase 12, que ahora el servidor frena: probado escribiendo a mano una `nomenclatura` que
pisa el código de otro) y el **código** (dos muebles con el mismo código son dos espacios
compartiendo contratos, archivos y correos de montaje). Cuando los dos apuntan al mismo
problema —que es lo normal con un solo nombre— se dice una vez sola.

**Contrato para el frontend:** el rechazo es `409` con
`detail = {code: "nombres_repetidos", message, choques: [...]}`. `choques` son frases
completas, listas para mostrar. Ojo: `409` ya se usa para `layout_conflict` y
`layout_deleted`, así que hay que **mirar `detail.code`**, no sólo el estado.

---

## 6. La planilla, con un solo nombre

**No hizo falta tocar `bulk_leases.py`.** La planilla ya resolvía contra `code`, y ahora
`code` **es** el nombre único: se resuelve contra el nombre por construcción, no por un
cambio. Lo que cambia es el resultado — probado de punta a punta en
`test_la_planilla_resuelve_contra_el_nombre_unico`:

- **Antes de renumerar**, la fila `IMP-01` sale `error` con «es ambiguo»: ese texto era el
  código de un mueble y el nombre dibujado de otro. Correcto, y es lo que la fase 12 hace.
- **Después de renumerar**, la misma fila entra en **verde**, sin un aviso, resuelta a
  `NAVE-IMP-01`, con `nombre_dibujado: null` — y lleva al mueble que el plano dibuja
  «IMP-01». El único mensaje que queda es la nota de siempre («proveedor nuevo»), que se
  dice y no pinta la fila.

**La detección de ambigüedad queda como red**, tal como se pidió: `nombre_de_mueble` sigue
leyendo `nomenclatura || code`. Mientras alguien pueda dibujar dos muebles con el mismo
rótulo —una base que no se migró, un cliente viejo que todavía mande el campo— hay que
poder verlo. El encabezado de esa sección de `layout_lookup.py` ahora **empieza avisando**
que describe el modelo viejo y que sobrevive como red, para que quien lo lea en 2027 no
crea que sigue siendo el diseño.

**Los 45 tests de la fase 12 pasan sin tocar una expectativa.** Ni una sola dejó de tener
sentido: todas describen planos sucios, y los planos sucios siguen siendo posibles (se
guardan, se avisan, se rechazan igual que antes). La única que podría haber roto es la
siembra —todas hacen `PUT` de un plano con seis nombres que pisan códigos ajenos— y entra
porque un plano que llega por primera vez no se compara con nada.

---

## 7. Qué se probó

`backend/tests/test_renumeracion.py` — **27 pruebas**, todas nuevas.

| Lo que pide el encargo | Prueba |
|---|---|
| El conteo y el conjunto de `id` se conservan | `test_ningun_mueble_se_agrega_ni_se_borra` |
| Ninguna coordenada se mueve | `test_no_se_mueve_una_sola_coordenada` (campo por campo, no sólo `cx`/`cz`) |
| Una rotación pura se aplica sin chocar | `test_una_rotacion_pura_de_nombres_se_aplica_sin_chocar` (9 góndolas con contrato, permutación completa) |
| Correrla dos veces no cambia nada | `test_correrla_dos_veces_no_cambia_nada_la_segunda_vez` (ni `updated_at`) |
| `spaces.code` apunta al mismo mueble físico | `test_el_espacio_sigue_apuntando_al_mismo_mueble_fisico` (por `id` de mueble, y el contrato sigue ahí) |
| El choque nuevo se rechaza, el preexistente se guarda | `test_el_choque_nuevo_no_se_guarda`, `test_el_plano_que_ya_esta_mal_se_sigue_guardando`, `test_una_nomenclatura_que_pisa_el_codigo_de_otro_tampoco_entra`, `test_el_intercambio_de_nombres_no_es_un_choque_nuevo` |
| El previo no escribe nada | `test_el_previo_no_escribe_una_sola_fila` |

Y además: la regla de recorrido contra la geometría (`test_el_recorrido_sale_de_la_geometria_y_no_de_una_corazonada`,
con el mapa completo `id → nombre nuevo` escrito a mano), el determinismo, el eje por la
forma del recinto, el espejo del prefijo **contra el archivo del frontend**, el `svg_id` y
el `name`, la confirmación de montaje, la cara `-B`, el bloqueo por espacio huérfano, el
bloqueo por mueble sin `id`, el aviso del código corto, la desaparición de la
`nomenclatura`, todas las sedes parejo, que el plano renumerado **pase por su propio
guardarraíl**, y que renumerar sea sólo de administrador.

```
pytest tests/test_renumeracion.py tests/test_bulk_leases.py tests/test_nomenclatura_planilla.py
→ 72 pruebas, exit 0     (27 nuevas + 24 + 21 de la fase 12, sin tocar una expectativa)

Por diligencia, los archivos que ejercitan PUT /layout y los montajes:
pytest tests/test_contract_emails.py tests/test_files_acceso.py tests/test_derechos.py
       tests/test_sede_delete.py tests/test_mounts.py tests/test_bitacora.py
       tests/test_montaje_enlace.py
→ 123 pruebas, exit 0

cd frontend && npx tsc --noEmit → exit 0
```

No se corrió la suite completa ni `npm run build`, como pide la regla de verificación.

---

## 8. Archivos

| Archivo | Qué |
|---|---|
| `backend/app/services/renumeracion.py` | **Nuevo.** La regla de recorrido, los invariantes, el arrastre, el informe |
| `backend/app/services/layout_lookup.py` | `choques_nuevos` (el guardarraíl) + el aviso al principio de la sección vieja |
| `backend/app/routers/layout.py` | El guardarraíl adentro de `save_layout` y los dos endpoints |
| `backend/app/schemas/layout.py` | Los esquemas de la renumeración y el porqué de que `fixtures` siga siendo `list[Any]` |
| `backend/app/services/bitacora.py` | Una línea: la etiqueta de `sede.renumerar` |
| `backend/tests/test_renumeracion.py` | **Nuevo.** 27 pruebas |
| `backend/app/routers/bulk_leases.py` | **Sin tocar** — ver §6 |

**Sin commit ni push. Sin librerías nuevas. `frontend/**` sin tocar.**

---

## 9. Lo que queda para el frontend, el verificador y `docs/ESTADO.md`

1. **El frontend tiene que manejar el `409` con `detail.code === "nombres_repetidos"`** y
   mostrar `detail.choques`. Hoy `409` significa «otro equipo guardó»; si se lo trata igual,
   el usuario va a leer un mensaje que no tiene nada que ver.
2. **Las pantallas de la renumeración** (el previo con su tabla imprimible, el botón de
   aplicar) son del frontend. El texto imprimible ya viene hecho en `sedes[].texto`.
3. **`docs/ESTADO.md`** necesita, como mínimo: reescribir §«El código ambiguo…» diciendo que
   el modelo de dos nombres terminó; §«Una sola nomenclatura» y §«Un solo nombre para el
   mueble» hoy describen el modelo viejo; y agregar el guardarraíl de servidor a
   §«El plano, que es donde empieza todo». Queda **fuera de este encargo** y hay que hacerlo
   antes del PR. Sigue pendiente además el párrafo de §«Carga masiva» que la fase 12 dejó a
   medias (F6).
4. **Los enlaces de montaje ya emitidos** dejan de servir después de renumerar (§3). Hay que
   decidir si se reenvían.
5. **Lo que no se midió acá**: la renumeración no se corrió contra los planos de producción
   —no están en el repo— sino contra planos de prueba construidos con la geometría que
   `docs/ESTADO.md` mide en NAVE. El previo existe justamente para eso: **hay que correrlo
   contra la base real y leer el informe antes de aplicar**, sede por sede.
