# ENTREGA — Fase 8 · Detalle por cliente para asesoría

Rama `claude/fase-7-transparencia` (Fase 8 encima de Fase 7, misma rama), árbol
de trabajo sin commitear: 12 archivos modificados (+1121/−90) y 5 nuevos
(`backend/app/plataforma_detalle.py`, `backend/tests/test_plataforma_detalle.py`,
`backend/tests/test_detalle_ataques.py`, `frontend/src/pages/DetalleCliente.tsx`,
`features/asesoria-detalle/outputs/`). Fecha: 2026-09-05.

## Veredicto del Maestro

**La fase NO se cierra todavía. Está construida entera y la frontera aguantó;
falta un test desactualizado, tres arreglos de una línea y dos corridas.**

Las cuatro partes de la spec (endpoint + recomendaciones, página, política +
catálogo + ESTADO, red team) están hechas, son coherentes entre sí (ronda 1:
dos advertencias, ninguna contradicción de fondo) y la verificación
independiente confirmó cada cifra con una sonda propia (80/80, 10/10 agujas de
PII ausentes, sólo lectura medida por conteo de filas). `tsc` y `build`
limpios. Capturas listas.

Pero la suite completa da **1 rojo determinista** en las dos corridas:
`backend/tests/test_auditoria_frontera.py:196
test_f01_solo_metricas_tendencia_y_adopcion_abren_una_base_de_cliente`. Es el
guardián de "alguien agregó una ruta que abre bases de cliente" haciendo su
trabajo: la allowlist de `:227-236` no conoce `/clientes/{slug}/detalle`. La
Fase 7 la amplió para `/reporte` (commit `4f1cb9f`); la Fase 8 no lo hizo, y
ningún agente corrió ese archivo (el auditor lo listó entre "las fronteras que
esta fase no debía mover" y no lo ejecutó).

El rojo destapa además una **decisión que hay que tomar explícitamente antes de
parchear el test** — está tomada abajo, en §4.1 — y la Fase 8 deja dos
hallazgos abiertos del auditor (xfail estrictos) más uno del Verificador que
conviene cerrar en el mismo commit. Todo junto son ~20 líneas de código y
documento; el resto es correr la suite dos veces.

## 1. Qué se construyó

### 1.1 Backend — `GET /api/plataforma/clientes/{slug}/detalle` (backend-detalle, opus)

- **`backend/app/plataforma_detalle.py`** (nuevo, ~1.100 líneas). `armar_detalle`
  es la única puerta: abre la base del cliente pedido **una vez**, sólo `query`,
  lee plano + `spaces` (sólo `code`, `zone`, `area_m2`) + `space_leases` (sin
  `notes`, sin ids) + `app_config` (sólo para el sí/no de la tarifa), y arma en
  memoria: `sedes[]`, `espacios[]` (una fila por cara comercializable, `-B`
  incluida, con `estado` `ocupado|libre|se_libera` y el contrato publicado —
  proveedor y marca saneados, canon, inicio, fin, `dias_para_vencer`,
  `arranca_en_periodo`), `contratos_fuera_del_plano`, `resumen_por_tipo[]`
  (con `tarifa_configurada` sí/no, nunca el valor), `proveedores[]`,
  `movimientos[]` (12 meses, entradas y salidas con motivo
  `vencimiento|cancelacion` — `is_active=False` con `end_date` intacta es la
  cancelación; el modelo no tiene tabla aparte), `benchmark_plataforma`,
  `oportunidades[]` y `recomendaciones[]`.
- **`benchmark_por_tipo(anio_mes)`**: la única otra apertura de bases. Recorre
  los mismos clientes que `plataforma_metricas._calcular`, devuelve `{tipo:
  canon promedio}` — un número por tipo, sin slugs ni conteos —, caché de 5 min
  por período con el mismo LRU acotado de `/metricas`.
- **Recomendaciones** (`id="{tipo}:{clave}"`, orden prioridad → valor desc →
  id): `espacio_libre` (una por tipo con ≥1 libre/se_libera, valor Σ precio
  sugerido), `contrato_por_vencer` (≤60 días; ≤30 días alta, nunca menos que
  media), `precio_bajo_tarifa` (contra el promedio del PROPIO cliente, nunca la
  tarifa), `concentracion_proveedor` (≥40 % de los contratos del período; ≥60 %
  alta), `sede_subutilizada` (≥15 puntos bajo la ocupación global, con ≥2
  sedes), `sin_tarifa` (siempre baja, valor 0), `arranque` (ÚNICA con cero
  contratos del período). Prioridad general: alta ≥15 % del ingreso contratado
  del mes, media ≥5 %. La `explicacion` la genera el backend por plantilla,
  sólo con nombres saneados, códigos, tipos, fechas y plata (`"$ 1.200.000"`).
- **`backend/app/routers/plataforma.py`**: ruta nueva AL FINAL (después de
  `/clientes/{slug}/reporte`), `slug` normalizado, `periodo` validado ANTES de
  abrir nada (422), 404 con el texto fijo `"No hay un cliente con ese
  código."`, 503 con `ERROR_BASE_ILEGIBLE`, **bitácora SIEMPRE y DESPUÉS de
  armar** (`accion="detalle"`, `periodo="<slug>:<YYYY-MM>"`; un 401/403/404/422
  no deja línea). Sin caché del detalle: cada consulta se calcula y se anota.
- **`backend/app/plataforma_metricas.py`**: sólo +71 líneas, dos helpers
  nuevos (`_del_periodo` — la regla "activo en el período" enunciada una vez
  para el SQL de `_contratos_activos` y la decisión en memoria del detalle — y
  `_contratos_del_cliente`). Nada de Fase 7 cambió de firma ni de conducta.
- **`backend/tests/test_plataforma_detalle.py`**: 33 tests verdes.
- SIN MIGRACIONES. Cero fórmulas duplicadas: reusa `_numeros_del_layout`,
  `_es_gondola_doble`, `_tarifa_aplicable`, `sanear_nombre_proveedor`, `_pct`,
  `_plata`, `_huella`, `normalizar_periodo`, `ClienteDesconocido` (el mismo 404
  de `/tendencia` y `/reporte`).

### 1.2 Frontend — `/plataforma/clientes/:slug` (frontend-detalle, sonnet)

- **`frontend/src/pages/DetalleCliente.tsx`** (nuevo): cabecera (Volver,
  nombre/slug/estado, selector de período `type="month"`, "Reporte de
  transparencia", "Imprimir recomendaciones", `TemaToggle`) y las seis
  secciones en el orden de la spec: **Recomendaciones** (tile Σ valor en juego
  + conteo por prioridad, lista con badge, etiqueta del tipo, valor y la
  `explicacion` tal cual llega), **Oportunidades** (tabla con precio + origen,
  candidatos como chips resaltados si `mismo_tipo`, y la oración armada en el
  frontend: `"Ofrecer NAVE-PUN-02 (punta) a Alpina a unos $ 900.000."`),
  **Espacios** (filtros sede/tipo/estado + buscador por código o proveedor,
  "vence en N días" en `se_libera`, contador "N de M"), **Por tipo** (tarifa
  sólo como Sí/No), **Proveedores**, **Movimientos** (barras `|entradas −
  salidas|` + mes a mes).
- Impresión: `@media print` propio que oculta controles y todas las secciones
  salvo Recomendaciones y Oportunidades, fuerza paleta clara con
  `IMPRESION_CLARA_VARS` (constante extraída de `consola.tsx`, que
  `ReportePlataforma.tsx` ahora también usa, byte a byte los mismos valores) y
  pie `"RECABRA · Recomendaciones de asesoría · <período> · generado <fecha>"`.
- **`frontend/src/api/plataforma.ts`**: tipos completos del shape (cero `any`)
  + `getDetalleCliente`, sin `localStorage`. **`App.tsx`**: ruta antes del
  catch-all. **`Plataforma.tsx`**: botón "Ver detalle" por fila.
- Estados: cargando / `Sin plano cargado.` (las secciones igual se pintan: un
  cliente sin plano puede tener `arranque`) / error con el `detail` del backend
  tal cual. Sin librerías nuevas, tokens `--con-*`, claro y oscuro, bajo la CSP.

### 1.3 Política, catálogo y ESTADO (legal-catalogo, opus)

- **`docs/legal/politica-datos.md`** y copia byte-idéntica en
  `frontend/src/legal/politica-datos.md` (md5 `bf7ecfa6…`): §3.6 nuevo con las
  cuatro finalidades (asesoría comercial, salud de la cartera, cobranza y
  administración, **mejora del servicio y de la plataforma**); §5.3 (a) suma el
  bloque taxativo "El detalle de espacios y contratos, para el servicio de
  asesoría comercial" (siete viñetas, cierre "sólo lectura, queda en bitácora");
  párrafo nuevo "Ampliación de esta misma versión, antes de su despliegue" que
  distingue el cambio de PRECISIÓN de Fase 7 del cambio de ALCANCE de Fase 8;
  §5.3 (b) perdió "ningún contrato, ningún espacio" (grep vacío) y quedó como
  lista de ocho prohibiciones; (c) y (d) suman el detalle a accesos y bitácora;
  `[VALIDAR CON ABOGADO]` nuevo sobre contrato individual + nombre comercial y
  sobre el benchmark cruzado (7 → 8 marcadores); §11 con fila de ampliación
  bajo la de 2026-09-v2 sin tocar la línea que el test lee.
  **`VERSION_POLITICA` sigue `"2026-09-v2"`** (la v2 nunca se desplegó; el
  titular consiente el trato completo en un solo acto).
- **`backend/app/plataforma_reporte.py`**: `CATALOGO` 22 → **34 entradas**, 12
  nuevas con `endpoints: ["detalle"]` y `finalidad: "asesoria"`
  (`espacio_codigo_y_tipo`, `espacio_estado`, `contrato_proveedor` saneado,
  `contrato_marca`, `contrato_canon_mensual`, `contrato_fechas`,
  `resumen_por_tipo`, `proveedores_del_cliente` saneado, `movimientos`,
  `benchmark_plataforma`, `oportunidades`, `recomendaciones`). El enum de
  `finalidad` NO cambia (lo tipa el frontend; la finalidad nueva vive en la
  política y §5.3 (c) explica la asimetría). `_accesos_del_cliente` gana la
  rama `accion == "detalle"` → alcanza si `periodo.startswith(f"{slug}:")`.
  Docstring del módulo actualizado: la regla "agregados, nunca filas" dejó de
  ser cierta en un punto acotado y **declarado**.
- **`backend/tests/test_plataforma_reporte.py`**: +2 tests (el dueño ve la
  consulta de detalle de SU cliente y no la de otro; el catálogo declara las 12
  claves con el shape exacto). Ninguna aserción existente borrada ni ablandada.
- **`docs/ESTADO.md`**: cabecera, enmienda de la regla del operador en Fase 4 y
  su nota gemela en "Clientes comerciales" (era la única que aún decía "nunca
  filas individuales"), sección Fase 8 nueva, pendientes para el abogado.

### 1.4 Red team (auditor-frontera, opus)

- **`backend/tests/test_detalle_ataques.py`** (nuevo): 39 tests, 37 verdes + 2
  `xfail(strict=True)`, corridos contra código real. Cubre fugas de la propia
  base (columnas prohibidas, arrobas, teléfono con separadores y Unicode
  `＠`/ZWSP, tarifa por múltiplos y divisores, campos denormalizados del plano),
  cross-tenant (nada de B en A, benchmark plano e igual a `_plata((a+b)/2)`,
  cabeceras y query que no cambian de base, 403 indistinguible, base rota que
  no contamina), auth y errores (401 antes de mirar el slug, 5 credenciales no
  operador, 404 sin decir de más, misma ventana de período que `/metricas`, 503
  sin ruta de archivo ni línea de bitácora, 200 en los tres estados de cuenta,
  token de montaje fuera), bitácora y reporte, sólo lectura por **sha256 del
  archivo sqlite** y grep estático del módulo, orden de rutas, 405 en cuatro
  verbos, y coherencia interna (agregados que cuadran con las filas,
  candidatos sólo del cliente, `explicacion` sin PII y con vocabulario
  cerrado, `[arranque]` exacto, fechas sin hora, cara `-B`, contrato fuera del
  plano).
- Dos desvíos justificados del brief: operador con `OPERADOR_EMAILS` vacío da
  **401** (el token muere, `app/auth.py:493-507`), y el grep estático mira el
  receptor de `.add(` (los cinco `.add(` del módulo son sobre `set`).

## 2. Coherencia

Ronda 1: `coherente: true`, dos conflictos de severidad advertencia, ambos en
dirección segura (el código protege MÁS de lo que declara o de lo que otro
campo hace):

| id | de → a | qué | estado |
|---|---|---|---|
| detalle-1 | backend → auditor | `Space.zone` viaja VERBATIM en `espacios[].zona`; proveedor y marca pasan por `sanear_nombre_proveedor`, zona no. Rompe la invariante "ningún string del JSON con arroba". | **Abierto**, fijado por `test_d09` (xfail strict). Arreglo: §4.2. |
| detalle-2 | backend → auditor + legal | `CATALOGO.contrato_marca` declara `tratamiento: "exacto"`, `_contrato_publico` la sanea (`plataforma_detalle.py:389`). Legal lo pidió (F8-3) y backend ya lo había hecho; el catálogo no se enteró. | **Abierto**, fijado por `test_d34` (xfail strict). Arreglo: §4.3. |

Coincidencias que confirman que los cuatro trabajaron sobre el mismo contrato:
el shape del backend y los tipos del frontend son idénticos clave por clave
(`d06` lo fija del lado del backend, `tsc` del lado del frontend); el formato
`"<slug>:<YYYY-MM>"` de la bitácora lo escribe backend, lo lee la rama
`detalle` de legal y lo prueban los dos (test del reporte a mano + `d32` por el
endpoint); las 12 entradas del catálogo cubren todo lo que el detalle publica
(`d33`); la política nombra al módulo `plataforma_detalle.py` antes de que
existiera y el nombre coincidió.

Una costura que no es conflicto pero conviene saber: legal (F8-4) pidió barrer
las `explicacion` como TEXTO, no sólo por claves; el auditor lo hizo (`d52`) y
el Verificador también (7/7 explicaciones sin PII sembrada).

## 3. Verificación (cifras del Verificador, sonda independiente)

Siembra: cliente `detcli` con 2 sedes, góndola doble A/B, punta y nevera en
NAVE, punta en SUR; 3 contratos del período (uno vence adentro, uno arranca
adentro), uno vencido y uno cancelado; proveedor con correo y teléfono metidos
en `name`; segundo cliente `detbench` para el benchmark. Período `2026-09`.

| checklist de la spec | resultado |
|---|---|
| Espacios con tipo, estado, contrato exacto | **5/5**: `NAVE-GON-01` gondola/ocupado $1.000.000 2026-01-01..12-31 Alpina · `NAVE-GON-01-B` gondola/ocupado $600.000 (arranca 09-15) · `NAVE-PUN-01` punta/**se_libera** $2.000.000 vence 09-20 `"Nutresa [correo oculto] [teléfono oculto]"` · `NAVE-NEV-01` nevera/libre · `SUR-PUN-01` punta/libre |
| grep de PII | **10/10 agujas ausentes** (correo y teléfono del proveedor, `contact_name`, tres notas, correo de ventas, teléfono con espacios, dos correos de dueños). Claves con `tarifa` == `{tarifa_configurada}`. Cero claves prohibidas en ningún nivel |
| Resumen por tipo | gondola 2/2/0 prom 800.000 min 600.000 max 1.000.000 · punta 2/1/1 prom=min=max 2.000.000 · nevera 1/0/1 `null`. Σ totales = 5 = `espacios[]` |
| Oportunidades | `SUR-PUN-01` precio 2.000.000 `origen_precio="cliente"`, candidatos [Nutresa (mismo_tipo), Alpina], ninguno ocupa ese espacio · `NAVE-NEV-01` 400.000 `"benchmark"` = (300.000+500.000)/2 del segundo cliente · 3 oportunidades ordenadas desc |
| Recomendaciones | 7 en orden: alta espacio_libre 4.000.000 · alta contrato_por_vencer 2.000.000 (19 días) · alta sede_subutilizada 2.000.000 · alta concentracion_proveedor 1.600.000 (66,7 % Alpina) · media espacio_libre 400.000 · media precio_bajo_tarifa 200.000 · baja sin_tarifa 0. Los 4 exigidos presentes. `arranque` único: `test_d52b` |
| Auth, bitácora, reporte | 401 sin token · 403 dueña · 403 legado y worker · 404 texto fijo. Bitácora: **exactamente 1 fila** (`op@recabra.co`, `detalle`, `detcli:2026-09`); los errores no dejan línea. Reporte del dueño: `accesos.total=1` con esa línea; catálogo 34 entradas, 12 `["detalle"]`. **Sólo lectura**: conteos 5/5/3 idénticos antes y después |
| Política | md5 idéntico; `VERSION_POLITICA="2026-09-v2"`; §5.3 (a) :385-415, (b) :440-460 sin "ningún contrato, ningún espacio", §3.6 :188; 11 marcadores intactos + 1 nuevo (:548) |
| Capturas | `outputs/capturas/detalle-cliente-{claro,oscuro}.png` (1440×3430), 6 secciones, cero PII en la página renderizada, tarifa sólo Sí/No |
| `tsc` y `build` | exit 0 ambos (aviso preexistente de chunk >500 kB) |
| grep `K_MINIMO\|_suprimir_celda_chica\|Suprimido` | vacío en `backend/app` y `frontend/src` |
| **Suite completa ×2** | **ROJA ×2, mismo y único fallo**: `test_f01` (ver §4.1). ~20 min por corrida |

Estado del árbol al terminar: sin procesos huérfanos, sin `.db` en `backend/`,
`git status` igual al de partida más `outputs/capturas/`.

## 4. Conflictos abiertos y qué hacer con cada uno

### 4.1 BLOQUEANTE — `test_f01` y la pregunta "¿una base o N?"

`/detalle` abre `{galerias, acme}`, es decir la base del cliente pedido **y la
de cada cliente legible**, porque `benchmark_por_tipo` recorre todas
(`plataforma_detalle.py:227 _calcular_benchmark → :202 _acumular_benchmark`).
La spec dice "Abre **una sola** base de cliente" y `docs/ESTADO.md:817/:835` lo
repiten; el docstring del módulo (`:8-12`) y `ESTADO:887` dicen lo correcto
("el benchmark es lo único del detalle que mira más de una base").

**Decisión del Maestro: el código está bien y la frase "una sola base" es la
que está mal.** Razones: (1) la misma spec exige, en el punto 5 y en "Lo que NO
se abre", un benchmark = "promedio de TODOS los clientes legibles por tipo" —
no hay forma de calcularlo sin abrirlas, y `snapshot_metricas` no guarda canon
por tipo; (2) `/metricas` abre exactamente las mismas bases con la misma
disciplina (secuencia, read-only, `try/except` por cliente, caché de 5 min);
(3) lo que cruza es un `dict[str, float]`, un número por tipo, verificado por
`d11` (igual a `_plata((a+b)/2)`) y `d10` (nada de B en A); (4) la política ya
lo declara así (`benchmark_plataforma` en el catálogo, viñeta 7 de §5.3 (b), y
el marcador `[VALIDAR CON ABOGADO]` de :548 lo pregunta). La frontera que
importa no es "cuántos archivos se abren" sino "qué sale": eso no se ensanchó.

Lo que hay que hacer:

1. `backend/tests/test_auditoria_frontera.py:227-236`: agregar a `permitidas`
   `"GET /api/plataforma/clientes/galerias/detalle"` con un comentario gemelo
   del de `/reporte`: "Fase 8: abre la base del cliente pedido para el detalle
   y, SÓLO para `benchmark_por_tipo`, recorre las demás como `/metricas`; lo
   que cruza es un promedio por tipo, ver `test_detalle_ataques.py::d11`".
   Actualizar el docstring de `f01` (ya no son sólo tres rutas).
2. `docs/ESTADO.md:817` y `:835`: reemplazar "Abre **una sola** base de
   cliente" por el texto de §5.2 abajo. La spec queda como está (es histórica).
3. Decisión de producto pendiente, **no bloqueante**: legal (F8-2) recomienda
   no publicar el benchmark de un tipo con menos de N clientes aportantes,
   porque con dos supermercados con neveras el promedio se despeja por
   diferencia (el patrón de `frontera-5`). Hoy no hay umbral. Es la misma
   clase de decisión que el dueño tomó en Fase 7 (exactitud a cambio de
   transparencia); va al humano, §6.1.

### 4.2 detalle-1 — zona sin sanear (media)

`backend/app/plataforma_detalle.py:367 _zona_de`: cambiar `return zona or None`
por `return sanear_nombre_proveedor(zona) or None`. Después quitar el
`@pytest.mark.xfail(strict=True)` de `test_d09` (`test_detalle_ataques.py:1691`),
que pasará a XPASS y pondría la suite roja. La regla que queda escrita: todo
texto libre del cliente que cruza la frontera pasa por
`sanear_nombre_proveedor`; `sede` y `codigo` también son texto del cliente, pero
cortos y en mayúsculas — el auditor no les escribió test y yo tampoco lo
exijo para cerrar.

### 4.3 detalle-2 — la marca está saneada y el catálogo dice "exacto" (baja)

`backend/app/plataforma_reporte.py:362-368` (`contrato_marca`): `"tratamiento":
"saneado"` y en la definición cambiar "tal como la cargó el supermercado" por
"con el mismo saneo que el nombre del proveedor". Quitar el xfail de `test_d34`
(`test_detalle_ataques.py:1767`). Esto cierra también F8-3 de legal.

### 4.4 Hallazgo del Verificador — `participacion_pct` mal descrito

El código lo calcula como **cuota de contratos** (`plataforma_detalle.py:553
_pct(registro['contratos'], total)`), que es lo que la spec quiere (la
concentración es "≥ 40 % de los espacios ocupados") y lo que `concentracion_
proveedor` usa. Pero el catálogo (`plataforma_reporte.py:400`: "qué porcentaje
del canon del cliente representa") y la política (`politica-datos.md:405` y su
copia: "qué parte del canon del cliente representa") prometen cuota de canon. En
la siembra sale 66,7 % (2 de 3 contratos); por canon habría sido 44,4 %.

**Decisión: se corrige el documento, no el código.** En los dos archivos:
"qué parte de los contratos vigentes del cliente representa" (la política es
lenguaje llano). Después `cp docs/legal/politica-datos.md
frontend/src/legal/politica-datos.md` — la copia es test-enforced. Sigue
dentro de la misma v2: es una precisión de descripción, no un cambio de trato.

### 4.5 Desajustes de documentación (no bloquean, van en el mismo commit)

- `docs/ESTADO.md:859-863`: el shape usa `periodo` en movimientos y `espacio` /
  `origen` en oportunidades; el real (y el tipo del frontend) usa `mes`,
  `codigo` y `origen_precio`, y a oportunidades le faltan `sede`, `estado`,
  `valor_estimado_mensual` y `mismo_tipo` en candidatos. Texto corregido en
  §5.2.
- `docs/ESTADO.md:884`: marcador editorial `[completar con
  outputs/backend-detalle.md…]` sin resolver. Los umbrales eran correctos; el
  texto final está en §5.2.
- `docs/ESTADO.md:563`: la prosa de Fase 6 aún describe `Suprimido ‹3` como
  estado vigente de la columna "vs tarifa"; la Fase 7 lo quitó. Cambiar por
  "dos estados (`−12,4 %` / `+3,1 %`; `sin tarifa`) — hasta Fase 6 había un
  tercero, `Suprimido ‹3`, que la Fase 7 eliminó".
- `backend/app/routers/plataforma.py:3`: "DOS excepciones acotadas" omite
  `/clientes/{slug}/reporte` (que `f01` sí reconoce). Decir "tres".
- `backend/app/models/plataforma.py:98`: el comentario de
  `BitacoraPlataforma.accion` sigue en `"metricas" | "tendencia" | "adopcion"`;
  faltan `clientes`, `supresiones`, `reporte`, `detalle` (gap que legal dejó
  anotado).

### 4.6 Aceptado sin cambio

- El benchmark incluye al propio cliente (nunca se usa cuando el cliente ya
  cobra ese tipo; sale en `benchmark_plataforma` igual).
- Proveedores agrupados por nombre CRUDO y publicados saneados (precedente de
  `_top`; dos nombres distintos que saneen igual darían dos filas con el mismo
  `nombre` — conteo correcto antes que unicidad cosmética).
- `sede_subutilizada` cuenta sólo `libre`; `espacio_libre` y oportunidades
  también `se_libera`. Coherente con la columna `libres` de `sedes[]`.
- `benchmark_por_tipo` cuesta N aperturas por ventana de 5 min. Mismo perfil
  que `/metricas`.
- `estado_cuenta` en la cabecera como texto plano y no con `EstadoPill`
  (pulido de una línea, no bloquea).

## 5. Texto para `docs/ESTADO.md`

Legal ya escribió la enmienda y la sección; lo de abajo son las **sustituciones
puntuales** que faltan. Todo lo demás de la sección Fase 8 queda como está.

### 5.1 Enmienda de la regla del operador (Fase 4, `:247`) — agregar UNA frase

Después de "…de modo que el cliente ve en su propio reporte qué se lee de él y
quién lo leyó." insertar:

> El detalle abre la base del cliente pedido; la ÚNICA lectura de otras bases
> es `benchmark_por_tipo`, que recorre los mismos clientes que `/metricas` y
> devuelve un promedio de canon por tipo de espacio — un número, sin slugs,
> conteos ni nombres —; `test_auditoria_frontera.py::f01` y
> `test_detalle_ataques.py::d10/d11` fijan que eso es todo lo que cruza.

### 5.2 Sección "Fase 8" — párrafo del endpoint (reemplaza `:833-840`)

> **El endpoint.** `GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM`
> (`require_operador`; por defecto el mes en curso, misma ventana que
> `/metricas`; `app/plataforma_detalle.py`, ruta declarada AL FINAL de
> `routers/plataforma.py`). Abre la base de ESE cliente **una vez**, sólo
> `query`, y anota `accion="detalle"` con `periodo="<slug>:<YYYY-MM>"` en
> `bitacora_plataforma` **después** de armar (un 401/403/404/422/503 no deja
> línea). La única otra apertura de bases es `benchmark_por_tipo`: recorre los
> mismos clientes que `_calcular` de métricas (secuencia, read-only, `try/except`
> por cliente, caché 5 min con el mismo LRU acotado) y devuelve UN número por
> tipo. Por eso `test_auditoria_frontera.py::f01` lista esta ruta entre las que
> abren bases, junto a `/metricas`, `/tendencia`, `/adopcion` y `/reporte`.
> `slug` inexistente → 404 con el texto fijo `"No hay un cliente con ese
> código."`; dueño de cliente, legado y trabajador → 403; sin token → 401;
> período fuera de ventana → 422; base ilegible → 503 con `ERROR_BASE_ILEGIBLE`
> (la ruta del archivo va al log, nunca al JSON). Sin caché del detalle: cada
> consulta se calcula y se anota. SIN MIGRACIONES: todo sale de
> `layout_snapshots`, `spaces` (sólo `code`, `zone`, `area_m2`), `space_leases`
> (sin `notes` ni ids), `suppliers.name` y `app_config` (sólo el sí/no de la
> tarifa), con los helpers que ya existían (`_numeros_del_layout` y su mapa de
> tipos, `_es_gondola_doble`, `_tarifa_aplicable`, `sanear_nombre_proveedor`,
> `_huella`) más dos nuevos en `plataforma_metricas.py`: `_del_periodo` (la
> regla "activo en el período", enunciada una sola vez) y
> `_contratos_del_cliente`.

### 5.3 Sección "Fase 8" — bloque del shape (reemplaza `:852-868`)

```
{cliente:{slug,nombre,estado_cuenta}, periodo, desde, hasta, generado_en,
 sedes_con_plano,
 sedes:[{sede,espacios,ocupados,libres,ocupacion_pct}],
 espacios:[{codigo(SEDE-CODE, cara B con -B),sede,codigo_corto,cara:A|B|null,tipo,
            zona(SANEADA),area_m2,estado:ocupado|libre|se_libera,
            contrato:{proveedor(SANEADO),marca(SANEADA),canon_mensual,inicio,fin,
                      dias_para_vencer,arranca_en_periodo}|null}],
 contratos_fuera_del_plano: N,
 resumen_por_tipo:[{tipo,total,ocupados,libres,canon_promedio,canon_minimo,
                    canon_maximo,tarifa_configurada(sí/no)}],
 proveedores:[{nombre(SANEADO),espacios,tipos,sedes,canon_total,canon_promedio,
               participacion_pct(cuota de CONTRATOS, no de canon),desde,
               contratos_por_vencer_60d}],
 movimientos:[{mes,entradas:[{proveedor,codigo,tipo,canon_mensual,fecha,cancelado}],
                   salidas:[{proveedor,codigo,tipo,canon_mensual,fecha,
                             motivo:vencimiento|cancelacion}]}]  (12 meses),
 benchmark_plataforma:{<tipo>: UN promedio de todos los clientes legibles},
 oportunidades:[{codigo,sede,tipo,estado:libre|se_libera,precio_sugerido,
                 origen_precio:cliente|benchmark|null,valor_estimado_mensual,
                 candidatos:[{proveedor(SANEADO),canon_actual,mismo_tipo}]}],
 recomendaciones:[{id:"{tipo}:{clave}",
                   tipo:espacio_libre|contrato_por_vencer|precio_bajo_tarifa|
                        concentracion_proveedor|sede_subutilizada|sin_tarifa|arranque,
                   prioridad:alta|media|baja,valor_estimado_mensual,explicacion,datos}]}
```

### 5.4 Sección "Fase 8" — reglas y cifras (reemplaza `:870-885`, elimina el marcador)

> **Las reglas de estado, oportunidad y recomendación.** "Contrato del período"
> es `is_active AND start_date <= hasta AND end_date >= desde`
> (`_del_periodo`, la MISMA regla de `_contratos_activos`); con varios contratos
> sobre un espacio se publica el de fin más tardío. Un espacio está `ocupado`
> si tiene contrato del período, `se_libera` si además `fin <= hasta`, `libre`
> si no tiene ninguno; un contrato que arranca dentro del período cuenta como
> ocupado (`arranca_en_periodo`). Un contrato cuyo código no está en el plano
> no es un espacio pero sí es plata: cuenta en `contratos_fuera_del_plano`,
> `proveedores`, `movimientos` y `contrato_por_vencer`, nunca en `espacios`,
> `resumen_por_tipo` ni `oportunidades`. El **precio sugerido** de un espacio
> libre o que se libera es el canon promedio que ESE cliente cobra por ese
> tipo (`origen_precio: "cliente"`); si no cobra ninguno, el benchmark
> (`"benchmark"`); si tampoco, `null`. Los **candidatos** son proveedores del
> mismo cliente que no ocupan ese espacio, primero los del mismo tipo, por
> canon actual desc, hasta 3. Las **recomendaciones** (`id="{tipo}:{clave}"`)
> se ordenan por prioridad, valor desc e id: `espacio_libre` (una por TIPO,
> valor Σ precio sugerido), `contrato_por_vencer` (≤ 60 días; ≤ 30 alta y
> nunca menos que media), `precio_bajo_tarifa` (tipo con ≥ 2 contratos y alguno
> bajo el promedio del PROPIO cliente — nunca contra la tarifa), `concentracion_
> proveedor` (≥ 40 % de los contratos del período y ≥ 2 contratos; ≥ 60 %
> alta), `sede_subutilizada` (≥ 15 puntos bajo la ocupación global, con ≥ 2
> sedes), `sin_tarifa` (una, siempre baja, valor 0) y `arranque` como ÚNICA
> con cero contratos del período. Prioridad general: alta desde el 15 % del
> ingreso contratado del mes, media desde el 5 %. La `explicacion` la genera el
> backend por plantilla, sin PII: nombres saneados, códigos, tipos, fechas y
> plata como `"$ 1.200.000"`.
>
> **Verificación de cierre (2026-09-05).** Sonda independiente: cliente con 2
> sedes, góndola doble, punta y nevera, 3 contratos del período (uno vence el
> 20, uno arranca el 15) → 5/5 espacios con tipo, estado y contrato exactos;
> resumen gondola 2/2/0 prom 800.000 (min 600.000, max 1.000.000), punta
> 2/1/1 prom 2.000.000, nevera 1/0/1 `null`; `SUR-PUN-01` sugerido 2.000.000
> del cliente, `NAVE-NEV-01` 400.000 de benchmark = (300.000+500.000)/2 del
> otro cliente; 7 recomendaciones en orden alta×4 (espacio_libre 4.000.000,
> contrato_por_vencer 2.000.000 a 19 días, sede_subutilizada 2.000.000,
> concentracion_proveedor 1.600.000 con 2 de 3 = 66,7 %), media×2, baja×1;
> 10/10 agujas de PII ausentes, sólo `tarifa_configurada` como clave con
> "tarifa"; 401/403/403/404 sin línea de bitácora y exactamente una línea
> tras el 200, listada en el reporte del dueño; conteos de filas idénticos
> antes y después. Capturas en `features/asesoria-detalle/outputs/capturas/`.

### 5.5 Frontera — una viñeta más en la lista taxativa (`:895-905`)

Agregar a "lo que el detalle NO devuelve": "ningún texto libre del cliente sin
sanear: proveedor, marca **y zona** pasan por `sanear_nombre_proveedor` (el
auditor encontró la zona sin sanear, `detalle-1`, corregida al cierre)".

### 5.6 Pendientes conocidos — agregar

- **Benchmark con pocos aportantes**: `benchmark_plataforma` no tiene umbral de
  clientes aportantes por tipo; con dos clientes que tienen un tipo, cada uno
  puede despejar el canon del otro por diferencia. Decisión de producto
  pendiente (F8-2 de legal), misma familia que `frontera-5`.
- **`participacion_pct` es cuota de contratos**, no de canon: el catálogo y la
  política lo dicen así desde el cierre de Fase 8; si alguien lo cambia a canon,
  cambia también `concentracion_proveedor` y los dos documentos.

## 6. Qué le queda al humano

### 6.1 Cierre técnico (hoy, ~1 hora, casi toda de suite)

1. `test_auditoria_frontera.py:227`: allowlist + docstring de `f01` (§4.1).
2. `plataforma_detalle.py:372`: sanear zona; quitar xfail de `d09` (§4.2).
3. `plataforma_reporte.py:362-368`: `contrato_marca` → `saneado`; quitar xfail
   de `d34` (§4.3).
4. `plataforma_reporte.py:400` y `politica-datos.md:405`: "qué parte de los
   contratos vigentes del cliente representa"; `cp` a la copia del frontend
   (§4.4).
5. ESTADO §5.1-5.6, router docstring, comentario de `accion` (§4.5).
6. **Decidir el umbral del benchmark** (§4.1 punto 3): si se pone, es una
   condición en `_calcular_benchmark` (omitir el tipo con < N clientes
   aportantes), un test en `test_detalle_ataques.py` y una frase en el
   catálogo y en §5.3 (a). Si no se pone, dejarlo anotado como aceptado en
   Pendientes.
7. Suite completa dos veces en serie (`TMPDIR` propio, borrar `*.db` entre
   corridas, sin paralelizar por archivo — las bases hermanas `recabra_<slug>.db`
   chocan). Esperado tras 1-3: cero rojos, cero XPASS. `tsc` + `build`.
8. Commit único de Fases 7 y 8 sobre `claude/fase-7-transparencia` (o dos
   commits, primero el de Fase 7 ya descrito en su ENTREGA), PR a `main`.
   Render despliega desde `main` y ese deploy dispara el re-consentimiento a
   TODOS los usuarios en el próximo login — **no mergear antes de 6.3**.

### 6.2 Abogado — la política v2 completa (Fase 7 + Fase 8)

La Fase 8 cambia la naturaleza de lo que cruza: hasta hoy eran estadísticas
sin sujeto; desde hoy son filas de contratos con el nombre de un tercero. No
es necesariamente ilícito (el supermercado es responsable, RECABRA encargado,
y el encargado trata lo que la finalidad instruida exige, art. 3 lit. d y 25
del Decreto 1377), pero convierte el contrato de encargo del §5.2 —hoy
`[COMPLETAR]` desde Fase 3— de deuda formal en dependencia crítica. En orden
de urgencia (legal, F8-1 a F8-8):

1. **[bloqueante para desplegar]** ¿El contrato de encargo del §5.2, que no
   existe firmado, y la finalidad de asesoría comercial informada alcanzan
   para que el operador lea **canon, fechas y nombre comercial contrato por
   contrato**? Si no, ¿qué cláusula hace falta y de quién: del supermercado,
   o también del proveedor? Instrucción escrita en la política: si la
   respuesta es no, se **restringe la lectura del operador**, no se amplía el
   reporte.
2. **[bloqueante]** Nombre comercial de un **proveedor unipersonal** junto a su
   canon exacto: ¿dato personal del art. 3 lit. c? Ya no hay agregación que
   disocie. ¿Basta el saneo de correo/teléfono o hay que seudonimizar el
   nombre para el operador ("Proveedor #3") y perder el valor de la asesoría?
3. **[alta]** El **benchmark de plataforma**: cánones de unos clientes para
   sugerirle precio a otro. ¿Cubierto por el contrato de servicio como
   estadística agregada o hay que pactarlo con cada uno? ¿Mínimo de clientes
   aportantes por debajo del cual no se publica? (Enlaza con 6.1 punto 6.)
4. **[alta]** La **marca** como dato de un tercero: al cierre sale saneada
   igual que el proveedor (§4.3); confirmar que basta.
5. **[media]** **Plazo de retención de `bitacora_plataforma`** (§6,
   `[COMPLETAR]`): ahora guarda "miró los contratos de este cliente en este
   mes", no sólo "miró las métricas". Art. 4 lit. c/d de la Ley 1581.
6. **[media]** Heredadas de Fase 7, más urgentes con el detalle encima:
   agregado sobre un solo contrato; relación canon/tarifa sin umbral
   (despejable con `contratos_sin_tarifa == 0`); fecha de último acceso de un
   cliente con una sola cuenta; día de aceptación de la política.
7. **[baja]** Las `explicacion` generadas: hoy son sugerencia a un humano, sin
   efecto jurídico sobre nadie (no es decisión automatizada, art. 15 del
   Decreto 1377); la política lo dice. Que siga así.
8. **[baja]** §7.1(c), freno compartido del reporte con `/mi-export` (L-3 de
   Fase 7), sin cambios.

Los `[COMPLETAR]` heredados (contacto, encargado, proveedor de correo) siguen
abiertos: 18 en el documento. El contacto tiene que estar lleno antes del
correo de 6.3.

### 6.3 Comunicación a los clientes del trato completo v2

El aviso previo de la ENTREGA de Fase 7 (6.3) **hay que reescribirlo**: ya no
basta con "dejamos de omitir cifras cuando hay pocos contratos". El modal de
re-consentimiento seguirá siendo uno solo —ésa es la razón de no subir la
versión—, pero la comunicación tiene que cubrir las dos mitades. Antes de
mergear a `main`, a cada cliente activo (correo o llamada, con fecha estimada
de deploy):

- **Qué cambia, en dos frases.** (1) La consola del operador muestra las cifras
  exactas de su cuenta sin omitir las de pocos contratos. (2) Para poder
  asesorarlo, el operador pasa a ver **espacio por espacio quién ocupa qué, a
  qué canon y hasta cuándo**, y de ahí le prepara oportunidades y
  recomendaciones concretas (el "Imprimir recomendaciones" es lo que el asesor
  le deja). Enlace a la política v2, párrafos "Qué cambió respecto de la
  versión anterior" y "Ampliación de esta misma versión" de §5.3 — ya están
  en lenguaje llano.
- **Qué sigue sin verse, dicho explícitamente** (viñetas de §5.3 (b)): datos de
  contacto de sus proveedores y sus notas; notas de espacios y contratos; fotos
  y archivos; correos, nombres o ids de su gente; la tarifa de referencia (sólo
  si está configurada); nada de otro cliente en su detalle (el precio de
  referencia de plataforma es un promedio, un número por tipo); nada en modo
  escritura.
- **Cómo lo controla.** Cada consulta del detalle queda en su reporte de
  transparencia (`/reporte-plataforma`) con fecha, operador y período; el
  catálogo del reporte enumera dato por dato qué se lee y con qué tratamiento.
  Export completo y supresión siguen igual. A quién escribir: el contacto
  `[COMPLETAR]` de la política.
- **El benchmark, con honestidad**: sus cánones entran, como promedio por tipo
  y sin nombre, en el precio de referencia que se le sugiere a otros clientes
  — y los de otros en el suyo. Si el abogado o el dueño deciden umbral o
  opt-out, decirlo acá.
- **Qué pasa si no acepta**: el modal bloquea hasta aceptar. Decidir si a quien
  no quiere el trato nuevo se le ofrece baja con export y cierre, y quién lo
  atiende.
- **Al operador**: cada detalle que abra queda en la bitácora y el cliente lo
  ve en su reporte con su correo. Que lo sepa antes de que un cliente le
  pregunte por una línea "detalle · septiembre".

## Archivos de referencia

- Spec: `/tmp/retail-espacios-test/features/asesoria-detalle/spec.md`
- Entregables por agente: `/tmp/retail-espacios-test/features/asesoria-detalle/outputs/{backend-detalle,frontend-detalle,legal-catalogo,auditor-frontera}.md`
- Capturas: `/tmp/retail-espacios-test/features/asesoria-detalle/outputs/capturas/detalle-cliente-{claro,oscuro}.png`
- Test rojo: `/tmp/retail-espacios-test/backend/tests/test_auditoria_frontera.py:196-240` (allowlist `:227-236`)
- xfail abiertos: `/tmp/retail-espacios-test/backend/tests/test_detalle_ataques.py:1691` (d09) y `:1767` (d34)
- Arreglos: `/tmp/retail-espacios-test/backend/app/plataforma_detalle.py:367-372` (zona), `:553` (participación); `/tmp/retail-espacios-test/backend/app/plataforma_reporte.py:362-368` (marca), `:400` (participación)
- Política: `/tmp/retail-espacios-test/docs/legal/politica-datos.md` (§3.6 :188, §5.3 (a) :385-415, (b) :440-460, marcador nuevo :548, participación :405)
- ESTADO: `/tmp/retail-espacios-test/docs/ESTADO.md` (:161, :247-272, :563, :821-945, :966-975)
- Fase 7, para el cierre conjunto: `/tmp/retail-espacios-test/features/transparencia/outputs/ENTREGA.md`
