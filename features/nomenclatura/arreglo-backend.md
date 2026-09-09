# El arreglo, lado backend: que la ambigüedad se rechace con nombre y apellido

**Fase 12 · RECABRA · 2026-09-08.** Constructor de backend. Archivos tocados:
`backend/app/services/layout_lookup.py`, `backend/app/routers/bulk_leases.py` y
`backend/tests/test_nomenclatura_planilla.py` (nuevo). Ni una línea de `frontend/**`.
Sin migraciones: no se agregó ninguna columna ni cambió ningún esquema.

---

## 1. Qué hace ahora el servidor que antes no hacía

| # | Antes | Ahora |
|---|---|---|
| 1 | La fila «IMP-08» se resolvía contra el `code` y el contrato caía en el mueble que la persona no estaba mirando | La fila **no entra**, y el mensaje nombra los dos muebles |
| 2 | El eco de `validar` devolvía `codigo` (lo tecleado con la sede antepuesta) y `nombre` (el label del tipo: «Impulsador Marca» para los once impulsadores) | Suma **`nombre_dibujado`**: el nombre con el que el plano dibuja el mueble resuelto |
| 3 | Sin sede, el código corto resolvía igual y creaba un `Space` nuevo para un mueble que ya existía | La fila sin sede **no entra** |
| 4 | El código completo se armaba con el texto de la fila | Se arma con la **sede del fixture** resuelto |
| 5 | La sede de otra tienda creaba el contrato en ese otro supermercado, callado | Se rechaza **diciendo en qué sede sí existe** |

Los mensajes, tal cual salen:

```
«IMP-08» es ambiguo en CIUDAD JARDIN: es el código de un mueble y el nombre
dibujado de otro (código CIUDAD JARDIN-IMP-12). Escribí el código completo del
que quisiste.

Falta la sede: sin ella el código queda corto y crea un espacio nuevo.

«IMP-07» no existe en NAVE; sí existe en CIUDAD JARDIN.
```

## 2. `layout_lookup.py`: el nombre efectivo, y un índice del plano

**El nombre efectivo se espeja, no se reinventa.** `nombre_de_mueble(fixture)` devuelve
`nomenclatura.trim() || code`, que es literalmente `nombreDeMueble`
(`frontend/src/utils/nomenclatura.ts:150`); `nombre_propio` espeja `nombrePropio`, y
`normalizar` es `trim` + mayúsculas como el `normalizar` del frontend. Si las dos reglas se
separan, el backend rechaza ambigüedades que el plano no dibuja —o deja pasar las que sí— y
el sistema vuelve a mentir, que es el problema de fondo de esta fase.

**`PlanoIndexado`** lee `layout_snapshots` **una vez** y expone tres preguntas:

- `resolver(sede, espacio) → FixtureResuelto | None` — **acotado a una sede**. Acepta el
  corto (`IMP-08`) y el completo (`CIUDAD JARDIN-IMP-08`), y devuelve el fixture, la sede
  **del fixture** y el `codigo` completo armado con esa sede (conservando el `-B` de la cara
  de la góndola doble, que es un espacio distinto). `FixtureResuelto.nombre_dibujado` es la
  nomenclatura puesta a mano, o `None`.
- `ambiguedad(sede, espacio) → Ambiguedad | None` — el corazón: si el texto calza el `code`
  de un mueble **y además** el nombre dibujado de OTRO de la misma sede, devuelve los dos
  códigos completos, el tecleado y el dibujado.
- `sedes_con_codigo(espacio) → list[str]` — para poder decir dónde sí existe.

Antes cada fila hacía un barrido de todas las sedes (`db.query(LayoutSnapshot).all()`) y
ahora una planilla de trescientas filas hace **uno**. No era el objetivo, pero el índice
hacía falta igual para preguntar tres cosas por fila.

### Qué pasó con `find_fixture_by_space_code`

**Se conservó tal cual, y no la usa más la planilla.** Su único llamador es
`is_space_rentable`, que recibe un `Space.code` ya guardado —de una fila sembrada, de una
sede archivada, de un mueble borrado del plano después del contrato— y cuya única decisión
es *fallar abierto*. Estrecharla ahí convertiría «no encontré el mueble» en «no es
comercializable» para espacios que hoy se alquilan sin problema, que es un cambio de
comportamiento en el alta de a uno y no tiene nada que ver con esta fase. Lo que sí se hizo
fue dejar escrito en su docstring por qué busca en todas las sedes y por qué una fila de
planilla no puede entrar por ahí. `_fixtures_de_sede` (que usa `describe_location`) ahora
lee del índice, para que la regla de «acotar a la sede» viva en un solo lugar.

## 3. La decisión que tuve que tomar: el código completo desempata

El contrato dice que la ambigüedad se mide sobre «el texto de la fila (normalizado, sin el
prefijo de sede)» y que el mensaje termina en **«Escribí el código completo del que
quisiste»**. Leído al pie de la letra, escribir `CIUDAD JARDIN-IMP-08` también se le quita
el prefijo, vuelve a ser ambiguo, y el consejo del mensaje no se puede seguir: los seis
códigos pisados de CIUDAD JARDIN quedarían **imposibles de contratar por planilla**, y el
mensaje sería otra mentira del sistema.

Lo implementado: la ambigüedad se busca comparando el texto tecleado (menos la cara `-B`)
contra los **nombres dibujados**, que son cortos —es lo que entra en una cajita del plano—,
mientras que el `code` se compara con la tolerancia de siempre al prefijo de sede. Sale
solo: `IMP-08` calza un código y un nombre → ambiguo; `CIUDAD JARDIN-IMP-08` calza un código
y ningún nombre → resuelve. Escribir el completo es decir «hablo de la llave». Y no es una
excepción escondida: si alguien llegara a poner una nomenclatura **con** el prefijo de sede,
vuelve a haber dos candidatos y vuelve a rechazar.

Esto además es lo que mantiene vivo **vender de a uno desde el mapa**: el contrato
multiespacio entra por este mismo endpoint con `espacio: fullSpaceCode(...)`
(`Contrato.tsx:329`), o sea siempre el código completo. Ahí no hay nada que desempatar —el
mueble se señaló con el dedo— y sigue andando igual que antes. Si la ambigüedad se aplicara
también al código completo, esta fase habría roto la pantalla de Vender.

## 4. La regla que no se negocia: un plano que ya está mal se abre, se mira y se guarda

No se tocó `PUT /layout/{sede}` ni `schemas/layout.py`. **El plano se guarda igual**, con
sus seis nombres que pisan códigos ajenos, y se abre igual. Lo único que cambia es que una
**fila de planilla** ambigua no entra, y que el eco de la revisión muestra el nombre
dibujado para que la ambigüedad se vea antes de crear cuarenta contratos. Hay un test que lo
fija: `test_un_plano_que_ya_esta_mal_se_guarda_y_se_sigue_usando` guarda el plano del dueño
tal cual y después contrata uno de sus espacios por el código completo.

## 5. Los tests

`backend/tests/test_nomenclatura_planilla.py` — 16 pruebas, con la siembra del investigador
(once impulsadores, seis renombrados: `IMP-12 → «IMP-08»`, `IMP-14 → «IMP-12»`, …) más una
segunda sede NAVE para el caso de la columna Sede equivocada.

| Prueba | Qué fija |
|---|---|
| `test_la_fila_ambigua_no_entra_y_el_mensaje_nombra_los_dos_muebles` | «IMP-08» → error, y el mensaje trae `CIUDAD JARDIN-IMP-12` |
| `test_la_ambigüedad_tambien_frena_al_que_escribio_el_codigo_correcto` | el caso simétrico: «IMP-12» también calza dos muebles |
| `test_el_codigo_completo_desempata` | la salida existe, y es la que usa el mapa |
| `test_un_nombre_a_mano_que_no_pisa_ningun_codigo_no_molesta` | la regla es contra el choque, no contra renombrar |
| `test_la_cara_b_de_la_gondola_doble_conserva_su_sufijo` | rearmar el código no puede perder el `-B` |
| `test_nombre_dibujado_viaja_con_la_nomenclatura_puesta_a_mano` | llega «IMP-08» con `nombre` = «Impulsador Marca» |
| `test_nombre_dibujado_es_none_cuando_el_mueble_se_dibuja_con_su_codigo` | `None`, no el código repetido |
| `test_la_fila_sin_sede_no_entra` | el segundo agujero |
| `test_el_codigo_corto_nunca_crea_un_espacio_nuevo` | **no** aparece un `Space` «IMP-07» |
| `test_el_espacio_se_crea_con_la_sede_del_fixture` | `CIUDAD JARDIN-IMP-07`, sede del plano |
| `test_la_sede_de_otra_tienda_avisa_donde_si_existe` | «no existe en NAVE; sí existe en CIUDAD JARDIN» |
| `test_un_codigo_que_no_existe_en_ninguna_sede_sigue_diciendo_lo_de_siempre` | no se perdió el mensaje viejo |
| **`test_el_mismo_espacio_del_plano_no_queda_contratado_dos_veces`** | las filas «IMP-12» y «IMP-08», mismas fechas: **0 creados** |
| **`test_vendido_el_mueble_por_su_codigo_completo_la_segunda_venta_se_frena`** | contratado el mueble por su código completo, la fila que escribiría quien lee el plano no entra |
| `test_un_plano_que_ya_esta_mal_se_guarda_y_se_sigue_usando` | la regla que no se negocia |
| `test_el_nombre_efectivo_es_el_mismo_que_dibuja_el_plano` | `nombre_de_mueble` espeja `nombreDeMueble` |

Corrido (sólo lo mío, con `TMPDIR` fuera del repo):

```
cd backend && TMPDIR=/tmp/nom-fix-tmp python3 -m pytest \
  tests/test_bulk_leases.py tests/test_nomenclatura_planilla.py -q
40 passed
```

Las 24 pruebas que ya existían de la carga masiva pasan **sin tocarles una línea**, y
`python3 -c "import app.main"` importa limpio.

## 6. Lo que este PR NO hace, y qué queda pendiente

- **No renombra el `code` de verdad.** Arrastra `spaces.code`, `spaces.svg_id`,
  `mount_confirmations.space_code`, los enlaces de montaje y el histórico de la plataforma.
  Otro PR, con un endpoint de renombre que arrastre todo.
- **No resuelve la planilla por nomenclatura.** En el plano medido las 6 de 6 nomenclaturas
  son ambiguas: resolver por nombre dejaría seis filas imposibles de cargar y a la persona
  sin forma de desempatar. Por eso el desempate es el código completo.
- **No toca `PUT /layout/{sede}`.** El guardarraíl de «no crear un nombre que pisa el código
  de otro» queda, en esta fase, en el navegador (lo hace el otro constructor). Un guardarraíl
  de servidor ahí tiene que ser «no aceptar choques **nuevos**» comparando contra el snapshot
  anterior —bloquear los choques a secas dejaría CIUDAD JARDIN sin poder guardarse— y eso es
  un diseño propio, no una línea. **Queda anotado como el hueco más grande que sigue
  abierto**: hoy la regla vive sólo en el cliente.
- **No repara lo ya cargado.** Los contratos que ya cayeron en el mueble equivocado siguen
  ahí; hace falta la reconciliación de la consulta 2 del diagnóstico.
- **`docs/ESTADO.md` no se tocó** para no chocar con el otro constructor. El párrafo
  §«Carga masiva desde una planilla» → «Qué se rechaza y qué sólo se avisa» necesita sumar,
  a la lista de errores: *código ambiguo (es el código de un mueble y el nombre dibujado de
  otro), fila sin sede, y código que no existe en esa sede pero sí en otra*; y decir que el
  eco de la revisión devuelve `nombre_dibujado`.
