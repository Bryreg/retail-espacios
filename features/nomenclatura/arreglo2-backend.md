# Ronda 2, lado backend: que el consejo deje de ser una trampa y la colisión se diga

**Fase 12 · RECABRA · 2026-09-08 · rama `claude/fase-12-nomenclatura` en `/tmp/re-nom`.**
Constructor de backend, segunda ronda. Archivos tocados: `backend/app/routers/bulk_leases.py`,
`backend/app/services/layout_lookup.py` y `backend/tests/test_nomenclatura_planilla.py`.
**Ni una línea de `frontend/**`.** Sin migraciones, sin librerías nuevas, sin campos nuevos
en la respuesta: todo viaja por `mensajes` y `estado`, que la pantalla ya pinta.

Cierra el **F1** de `arreglo-verificacion.md` (grave, residuo de la ronda 1).

---

## 1. El residuo, en una frase

La ronda 1 rechazó la fila ambigua «IMP-08» y el mensaje terminaba en **«Escribí el código
completo del que quisiste»**. Quien está mirando la cajita que el plano rotula «IMP-08»
sigue el consejo, escribe `CIUDAD JARDIN-IMP-08`… y llega al **otro** mueble, el que lleva
ese código de verdad. La fila entraba sin una palabra, y el verificador midió que la foto de
la doble venta volvía exacta: dos cajas «IMP-08 · libre 16 sep», dos proveedores, el mismo
periodo (`capturas/fix-C2-1-vender.png`, `fix-C2-2-supervisar.png`).

**Rechazar el código completo no era una opción.** Los dos muebles son físicamente distintos,
contratar los dos es legítimo, y la pantalla de Vender manda **siempre** el código completo
(`Contrato.tsx:329`): prohibirlo dejaría seis muebles de CIUDAD JARDIN imposibles de
contratar y rompería la venta de a uno. Entonces no se rechaza: **se avisa**, con la
categoría que la carga masiva ya tiene —«entra, pero se mira»—.

## 2. Lo que dice ahora el servidor, textual

Medido por el endpoint real (`POST /api/leases/bulk/validar`, siembra del investigador: once
impulsadores, seis renombrados):

| fila | espacio | estado | mensajes |
|---|---|---|---|
| 2 | `IMP-08` | **error** | «IMP-08» es ambiguo en CIUDAD JARDIN. Escribí **CIUDAD JARDIN-IMP-12** para el mueble que el plano dibuja «IMP-08», o **CIUDAD JARDIN-IMP-08** para el que se dibuja con su propio código. |
| 3 | `CIUDAD JARDIN-IMP-08` | **aviso** | Ojo: este contrato va al mueble **CIUDAD JARDIN-IMP-08**, que se dibuja con su propio código. OTRO mueble de la sede se dibuja «IMP-08» y su código es **CIUDAD JARDIN-IMP-12**. |
| 4 | `CIUDAD JARDIN-IMP-12` | **aviso** | Ojo: este contrato va al mueble **CIUDAD JARDIN-IMP-12**, que el plano dibuja «IMP-08». Ese nombre es el código de OTRO mueble de la sede: **CIUDAD JARDIN-IMP-08**. · Y su código, «IMP-12», es además el nombre con el que el plano dibuja a un tercero: **CIUDAD JARDIN-IMP-14**. |
| 5 | `IMP-07` | **ok** | *(sólo la nota de siempre, «Proveedor nuevo: se va a crear.»)* |

Resumen del lote: `1 listas · 2 con avisos · 1 no entran`.

Un caso más, el del segundo mensaje cuando el mueble tecleado **no** se dibuja con su código:

```
fila «IMP-12» → error
«IMP-12» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-14 para el mueble que el
plano dibuja «IMP-12», o CIUDAD JARDIN-IMP-12 para el que tiene ese código, aunque el plano
lo dibuje «IMP-08».
```

Eso último importa: en la corrida renumerada el mueble que **tiene** el código `IMP-12` es
el que el plano dibuja «IMP-08». Decir de él «el que se dibuja con su propio código» sería
una segunda trampa adentro del mismo mensaje. `Ambiguedad.nombre_tecleado` existe para eso.

## 3. Qué se agregó, y dónde

### `layout_lookup.py`

- **`Ambiguedad.nombre_tecleado`** (`:179`, `:365`): cómo dibuja el plano al mueble que lleva
  el código tecleado. `None` si se dibuja con su propio código. Sin este dato el mensaje no
  puede describir bien el segundo camino.
- **`class Colision`** (`:193`): el mueble que la fila **sí** resolvió y el otro con el que se
  confunde. Dos direcciones, que pueden darse las dos a la vez sobre el mismo mueble:
  - `otro_se_dibuja_con_mi_codigo` — mi código corto es el nombre que el plano le pinta a
    OTRO. **Es la trampa de F1.**
  - `otro_tiene_por_codigo_mi_nombre` — el plano me dibuja con un nombre que es el código de
    OTRO. El caso simétrico (punto 3 del encargo).
  Los dos campos son **códigos completos**: un código corto adentro del aviso volvería a ser
  el texto ambiguo del que estamos tratando de salir.
- **`PlanoIndexado.colision(sede, resuelto)`** (`:371`): devuelve la `Colision` o `None`.

**La diferencia con `ambiguedad()` es todo el arreglo, y es una sola:** `ambiguedad` pregunta
por el **texto tecleado**, `colision` pregunta por el **mueble resuelto**. `CIUDAD
JARDIN-IMP-08` no es un texto ambiguo —calza una llave y ningún nombre, por eso desempata—
pero el mueble al que lleva sí tiene gemelo. Preguntar por el texto dejaba pasar justo el
camino que el mensaje de rechazo recomendaba.

Sin barridos nuevos: `colision` recorre los muebles de **una** sede del índice que ya se
construye una vez por lote, y de las dos direcciones a la vez en el mismo recorrido.

### `bulk_leases.py`

- **`_rechazo_ambiguo(a, sede)`** (`:176`) — arma el mensaje de rechazo con los dos caminos.
  Usado en `:315`.
- **`_avisos_de_colision(c)`** (`:204`) — devuelve uno o dos avisos. Usado en `:353-355`,
  dentro de la rama donde el mueble resolvió **y es comercializable**: un mueble marcado como
  parte del local ya se rechaza por otro motivo y «este contrato va al mueble…» sería falso.
- El aviso se suma a `avisos`, no a `notas`: **pinta la fila de ámbar**. Es la decisión
  central del punto 2 del encargo —«imposible de pasar por alto»— y es lo que lo separa de
  «Proveedor nuevo», que se dice sin teñir nada.

**Por qué el segundo aviso no repite el encabezado.** La pantalla junta los mensajes de una
fila en un solo párrafo (`CargaMasiva.tsx`, `r.mensajes.join(" ")`). Cuando un mueble choca
por las dos puntas, dos preámbulos idénticos —«Ojo: este contrato va al mueble …»— se leen
como ruido y tapan lo único que cambia. El segundo arranca en «Y su código, «IMP-12», es
además…», que se engancha con el primero y dice sólo lo nuevo.

## 4. Lo que NO cambió, a propósito

- **La regla que no se negocia sigue intacta.** No se tocó `PUT /layout/{sede}` ni
  `schemas/layout.py`: el plano con los seis nombres que pisan códigos ajenos se abre, se
  mueve y se guarda igual. Lo fija `test_un_plano_que_ya_esta_mal_se_guarda_y_se_sigue_usando`.
- **Vender de a uno no se toca.** Manda el código completo; ahora esa fila puede llevar un
  aviso, pero **entra** (`creados == 1`, medido en dos tests con `/confirmar`).
- **Ningún campo nuevo en la API.** `FilaOut` es idéntica: los avisos viajan por `mensajes` y
  el color por `estado`. El frontend no necesita ni una línea para mostrarlos.
- **`find_fixture_by_space_code` sigue igual**, con su docstring de la ronda 1.
- **Sin migraciones.** No se agregó ninguna columna.

## 5. Los tests

`backend/tests/test_nomenclatura_planilla.py` pasa de 16 a **21** pruebas. Cuatro nuevas más
una que cambió de expectativa a propósito:

| Prueba | Qué fija |
|---|---|
| `test_el_mensaje_ambiguo_ofrece_los_dos_caminos_con_su_codigo_completo` (`:143`) | los dos códigos completos, **en orden** (primero el que el plano dibuja así), y que ya no se dice «del que quisiste» |
| `test_el_mensaje_ambiguo_no_miente_sobre_el_mueble_que_tiene_ese_codigo` (`:169`) | con la fila «IMP-12», el segundo camino dice «aunque el plano lo dibuje «IMP-08»» y **no** «se dibuja con su propio código» |
| `test_el_codigo_completo_del_mueble_pisado_entra_con_aviso_y_nombra_al_otro` (`:219`) | **el punto 2**: `CIUDAD JARDIN-IMP-08` → `creados == 1`, `estado == "aviso"`, y el mensaje nombra `CIUDAD JARDIN-IMP-12` |
| `test_el_mueble_renombrado_avisa_con_que_nombre_lo_dibuja_el_plano` (`:247`) | **el punto 3**: `CIUDAD JARDIN-IMP-12` entra con aviso, dice con qué nombre lo dibuja el plano y de quién es ese nombre — y sale también el aviso de la otra punta (`IMP-14`) |
| `test_una_fila_sin_colisiones_no_gana_ningun_aviso_nuevo` (`:275`) | **lo que hay que cuidar**: `IMP-07` en el plano sucio sigue verde y sin «Ojo»; y con el plano limpio las tres filas dan `ok` con `avisos == 0` |

Y la que cambió: **`test_el_codigo_completo_desempata`** (`:185`) esperaba `["ok", "ok"]` y
ahora espera `["aviso", "aviso"]`, con `errores == 0`. Lo que ese test fija —que las dos
filas **entran**, porque si no los seis códigos pisados quedan sin poder contratarse y se
rompe Vender— sigue fijado, y quedó escrito en el propio test por qué el estado es aviso.

Corrido (**sólo mis archivos**, `TMPDIR` fuera del repo):

```
cd backend && TMPDIR=/tmp/nom-fix2-tmp python3 -m pytest \
  tests/test_nomenclatura_planilla.py tests/test_bulk_leases.py -p no:warnings
45 passed in 30.01s        (21 nomenclatura + 24 carga masiva, sin tocarles una línea)

python3 -c "import app.main"   → import ok
```

`tests/test_bulk_leases.py` no lo toqué; lo corrí porque prueba el mismo router que cambié.
**No corrí la suite completa** ni nada de frontend.

## 6. Lo que queda abierto

- **F5 sigue abierto y no es mío: en el plano 2D la colisión sigue siendo invisible**
  (`frontend/src/utils/nomenclatura.ts:340`, `rotulosDelPlano`). El plano dibuja una sola
  pastilla «IMP-08» y el `IMP-08` verdadero muestra sólo 🏷️. El backend ya sabe decir la
  colisión de las dos puntas —`PlanoIndexado.colision` está disponible para cualquier cosa
  del servidor que la necesite— pero **el plano es donde la persona elige** y ese rotulado es
  frontend. Con esta ronda la colisión se ve en la revisión de la planilla; en el plano, no.
- **F7 sigue abierto**: `PUT /layout/{sede}` acepta la lista de muebles sin mirar. La
  prohibición de crear un nombre que pisa el código de otro vive sólo en el navegador. Un
  guardarraíl de servidor tiene que ser «no aceptar choques **nuevos**» comparando contra el
  snapshot anterior —bloquear los choques a secas dejaría CIUDAD JARDIN sin poder guardarse—
  y eso es un diseño propio, no una línea.
- **No repara lo ya cargado**: los contratos que ya cayeron en el mueble equivocado siguen
  ahí. La reconciliación la lista el panel de Revisar (frontend).
- **`docs/ESTADO.md` sigue sin tocar**, para no chocar con el otro constructor. Al párrafo
  propuesto en `arreglo-backend.md` §6 hay que sumarle ahora, en §«Carga masiva desde una
  planilla» → «Qué se rechaza y qué sólo se avisa»:

  > **Se avisa (la fila entra, en ámbar):** el mueble resuelto tiene un gemelo de nombre en
  > la misma sede — o su código es el nombre que el plano le dibuja a otro, o el nombre que
  > el plano le dibuja es el código de otro. El aviso nombra los dos muebles con su código
  > completo. No se rechaza porque los dos muebles son físicamente distintos y contratar los
  > dos es legítimo; además Vender manda siempre el código completo y rechazarlo la rompería.
  > **El mensaje de rechazo por ambigüedad ofrece los dos caminos**, cada uno con su código
  > completo, empezando por el que el plano dibuja con el texto tecleado.
