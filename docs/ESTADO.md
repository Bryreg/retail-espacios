# RECABRA — estado del proyecto

Documento de referencia para retomar el trabajo sin tener que reconstruir el contexto.
Última actualización: agosto 2026 (disponibilidad por fechas y calendario por temporada).

Gestión de espacios comerciales en supermercados: se dibuja el plano de cada sede, se
marca qué muebles se pueden alquilar y se les asignan contratos de proveedores.

---

## Cómo corre

| | |
|---|---|
| **Producción** | [retail-espacios.onrender.com](https://retail-espacios.onrender.com) — Render, auto-deploy desde `main` |
| **Backend** | FastAPI + SQLAlchemy 2 + Postgres (`backend/`) |
| **Frontend** | React 18 + TS + Vite + Three.js (`@react-three/fiber@8`) + Tailwind + CSS vars (`frontend/`) |
| **Tipografía** | Geist / Geist Mono desde Google Fonts |
| **Roles** | `admin` y `worker` (JWT). Los precios se redactan server-side para worker, que además solo ve el Dashboard |

Sedes reales: **NAVE**, **POBLADO**, **ciudad jardin**. `TERRON`, `CENTRO`, `NORTE` y
`SUR` son las que la app trae por defecto.

### Levantar el entorno local

```bash
# backend
cd backend && DATABASE_URL="sqlite:///./dev.db" JWT_SECRET=dev uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Para que dos máquinas compartan datos en desarrollo, creá `frontend/.env.local`:

```
VITE_API_TARGET=https://retail-espacios.onrender.com
```

Sin eso, cada máquina habla con su propio backend y su propia base — y ninguna
sincronización puede funcionar entre ellas.

---

## Reglas duras

Estas no son preferencias. Romperlas rompe producción.

**Sin migraciones.** El esquema se crea con `Base.metadata.create_all()`. Eso crea
*tablas* nuevas pero **no agrega columnas a tablas existentes**: una columna nueva en
`spaces` o `layout_snapshots` simplemente no existiría en la base ya desplegada. Cuando
hizo falta guardar algo nuevo, se usó la tabla `app_config` (clave/valor) o el propio
JSON del layout.

**Modelo de datos dual.** Los datos comerciales viven en dos lados a la vez:

- Denormalizados dentro de cada fixture, en el JSON por sede de `layout_snapshots`
  (tipo `UnifiedFixture` en `frontend/src/types/fixtures.ts`).
- Normalizados en `spaces` / `space_leases` / `suppliers`, pero **solo** cuando se pulsa
  "Guardar contrato".

El código de espacio es `"SEDE-CODE"` en mayúsculas. La cara B de una góndola doble usa
sufijo `-B`; los campos top-level del fixture son la Cara A y `fixture.faceB` es la B
(helper `isDoubleGondola`).

**Dentro del plano el código es corto; afuera lleva la sede.** `PUN-01` es nomenclatura
de sede y se repite en las tres tiendas. Todo lo que salga del layout — la fila en
`spaces`, el enlace del correo, el reporte de montaje — usa el código completo, que arma
`fullSpaceCode(sede, code)` en `frontend/src/types/fixtures.ts`. Indexar por el código
corto es un bug silencioso: parece funcionar con una sola sede y con dos empieza a
mezclar tiendas.

**El 3D pinta, no construye.** La foto del proveedor se aplica *como material* de la cara
del mesh, tileada como planograma y alineada a las tablas reales vía `getPanelShelfSpan`.
Nunca crear geometría nueva posicionada para esto: se intentó dos veces y falló las dos.

**Orden de rutas en FastAPI.** Las rutas literales van declaradas **antes** de las
paramétricas y del catch-all, o éste se las traga. Aplica en `layout.py`
(`/revisions`, `/settings`) y en `spaces.py` (`/face-images`).

**El dinero no viaja al worker.** `negotiatedValue` se redacta server-side en las
respuestas de layout, `monthly_rent` en las de spaces, y las tarifas de referencia
exigen admin **también para leer**. En el cliente, las tarifas quedan fuera de
`partialize` a propósito: la clave `retail-fixtures-v1` sobrevive al logout, y una
máquina compartida no debe entregarle precios al siguiente turno.

**Los espejos comparan identidad, no booleanos.** El plano 2D y el editor 3D mantienen
una copia local del store. Los guards que evitan el eco comparan la *identidad del array*,
no una bandera: un booleano lo consume la pasada equivocada del ciclo de montaje, y eso
causó una pérdida de datos real (ver más abajo).

---

## Qué está hecho

### Sincronización entre computadores

El síntoma era "lo que hago acá no se ve allá". Eran varios defectos encadenados, todos
corregidos:

- `syncFromServer()` corría al cargar el módulo, **antes del login**: sin token daba 401,
  el interceptor borraba la sesión y nunca se reintentaba. Ahora arranca desde `App.tsx`
  con la sesión activa.
- El merge decidía por **cantidad** de fixtures, así que las eliminaciones nunca
  viajaban. Ahora manda la revisión (`updated_at`).
- Un único timer de guardado global para todas las sedes; ahora hay uno por sede.
- Sin revalidación tras la carga inicial. Hay polling de revisiones cada 20 s y refetch al
  recuperar el foco, al mostrar la pestaña y al reconectar.
- La lista de sedes y las etiquetas del catálogo vivían solo en `localStorage`. Ahora se
  comparten server-side y la lista visible es la **unión** de la configurada y de toda
  sede con snapshot, para que ninguna con datos quede oculta.
- Los fallos eran silenciosos mientras la UI decía "✓ Sincronizado". Hay un indicador real
  en el header y resolución explícita de conflictos.

Endpoints nuevos: `GET /layout/revisions` (polling barato), `GET/PUT /layout/settings`,
`DELETE /layout/{sede}`. El `PUT` acepta `base_updated_at` y responde 409 si otro equipo
guardó en el medio.

### Muebles comercializables

Campo opcional `rentable` en `UnifiedFixture`, con semántica retrocompatible: **ausente
significa comercializable**, solo un `false` explícito marca infraestructura (helper
`isRentable`). Columnas, cajas y zonas libres nacen como no comercializables.

Un mueble no comercializable no admite contrato (también bloqueado server-side con 409),
queda fuera de todas las métricas de disponibilidad y se dibuja en gris pizarra.

### Dashboard

KPIs arriba de todo, mapa isométrico y columna de "Atención" lado a lado, un solo buscador
para toda la página, y vista propia para el rol worker (arranca por espacios disponibles y
lo que vence, sin nada de dinero).

Al hacer clic en un mueble se abre un popover anclado a él; "Ver todo" pasa el detalle
completo a la columna derecha. Los campos vacíos no se dibujan.

### Paleta

Un solo lenguaje de color en Dashboard, plano 2D y editor 3D:

| Estado | Color |
|---|---|
| Libre | verde `#4CC38A` |
| Ocupado | violeta `#8B5CF6` |
| Reservado | ámbar `#F0B429` |
| No comercializable | pizarra `#94A3B8` |

El rojo queda reservado para lo que está mal (un contrato vencido).

### Tarifa de referencia y rendimiento $/m²

Eran los dos primeros del backlog; salieron juntos porque comparten dominio (dinero).

- **Tarifa de referencia** por tipo de mueble: una general + ajuste opcional por sede
  (`app_config`, clave `layout_reference_rates` — sin migraciones, como manda la regla).
  Se edita desde el botón **Tarifas** del Dashboard; guardado automático con el mismo
  debounce que las settings. La tarifa de góndola es **por cara** (doble y mural
  comparten tarifa, porque el valor negociado también es por cara).
- Endpoints `GET/PUT /layout/rates`, declarados antes del catch-all. A diferencia de
  `/layout/settings`, acá **también el GET exige admin**: es dinero. En el cliente las
  tarifas nunca tocan `localStorage` y un login de worker las deja en `null`, así que
  una máquina compartida no filtra nada.
- En los paneles de contrato (2D y 3D) el campo de valor muestra la referencia del
  tipo+sede y el desvío (`−17% vs referencia`, ámbar por debajo / verde en línea o
  arriba).
- En el Dashboard admin: sección **"Bajo tarifa de referencia"** en Atención, con el
  desvío y `pagado · ref` en compacto.
- **No hay ranking de $/m²** y no debe volver: el precio se cuadra internamente, y además
  medía el plano equivocado. La industria mide anaquel en metros lineales y facings (el
  informe de la FTC de 2003 pide "linear feet" y "facings"; "square feet" no aparece), y
  la huella de piso es cero o casi cero para ristra, robatope y exhibidor cruz. La tarifa
  plana por mueble/sede sí es la convención real: la rate card publicada de Albert Heijn
  cobra por mueble, por tienda, por unidad de tiempo, sin mencionar área.
- El helper es `referenceRateFor(rates, sede, type)` y la clave de tipo
  `rateTypeOf()` (normaliza los tipos 2D legados `gondola_doble`/`gondola_mural` a
  `gondola`). Umbral de marcado: desvío ≥ 1 % — un peso de redondeo no es anomalía.

### Disponibilidad por fechas y calendario por temporada

Un contrato cargado para diciembre marcaba el espacio como ocupado **desde el momento de
guardarlo** y sumaba su valor al ingreso mensual. Lo peor no era el número sino la venta
perdida: el backend sí razonaba por fechas y aceptaba vender los meses previos, pero nadie
lo intentaba porque la pantalla decía "ocupado".

- La ocupación se **deriva** de `startDate`/`endDate`, que ya viajaban en el JSON del
  layout (`contractPhase`). Derivar en vez de guardar evita tener que correr algo que
  voltee el estado al llegar la fecha, y funciona sobre los planos ya guardados: sin
  migración ni backfill.
- Estado **"Contratado"** para lo firmado que aún no arranca: tarjeta, chip de filtro y
  color propio en el mapa (violeta claro). El ingreso mensual cuenta solo lo vigente; lo
  pactado va en su propia línea.
- El mapa pinta de **rojo lo vencido**, que la paleta ya pedía y no estaba implementado.
- `Space.active_lease` devuelve el contrato vigente HOY y se agregó `upcoming_lease`.

Sobre el mapa hay un control **"Disponible para"**: chips de temporada más dos campos de
fecha. Con un periodo elegido cambia la lectura entera — la leyenda pasa a tres estados
(libre todo el periodo / libre parte / tomado) y aparece el conteo de lo vendible. Las
tarjetas de arriba **siguen reportando hoy**, a propósito, y el encabezado del mapa dice
cuál contesta qué.

### Temporadas comerciales

Separación que hace que esto no se pudra: el **ancla** es un hecho del calendario y se
calcula (tercer domingo de junio, pascua por Meeus/Jones/Butcher, viernes tras el cuarto
jueves de noviembre); la **ventana de venta** —días antes y después— es decisión comercial
y se guarda en `app_config`, global para las tres sedes. El año entrante las anclas se
mueven solas y las ventanas siguen puestas. Se editan desde el ícono junto a los chips
(admin). `GET /layout/seasons` lo lee cualquier rol: son fechas, no dinero.

**Aritmética de días** (`types/seasons.ts`): todo pasa por un entero calculado con
`Date.UTC` sobre los componentes civiles, y el parseo de `"YYYY-MM-DD"` es propio —
`new Date(str)` lo toma como UTC y en Colombia retrocede un día. Los rangos son
**inclusivos en ambos extremos**, igual que el chequeo de solapamiento del backend: un
mueble necesita día de desmontaje. Un contrato de **un solo día es válido** (Black Friday
es un viernes suelto).

`reservado` y `mantenimiento` no tienen fechas: describen el presente. Bloquean un periodo
que incluya hoy, pero **no** uno enteramente futuro — bloquearlo escondería inventario
vendible detrás de una bandera puesta meses antes.

### Una pantalla de sede, dos modos

Había dos pestañas —**Negociar** y **Resumen**— que abrían las dos con el plano de la
misma sede y se diferenciaban en poco más que el orden de las tarjetas. La pregunta "¿en
cuál de las dos hago el contrato?" no tenía buena respuesta, y quien entraba a Negociar
elegía el espacio de **una lista de códigos**: `PUN-04` no dice si la punta está en la
entrada o contra la pared del fondo, y esa es media negociación.

Ahora es **una sola pestaña (Sede)** con un interruptor arriba que declara para qué está
abierta la pantalla:

- **Vender** — el mapa se lleva la pantalla, pintado por disponibilidad del periodo, y la
  ficha del contrato va al lado. Sin KPIs: para poner un precio no sirve la ocupación de
  hoy, sirve ver qué hay libre en el periodo y dónde queda.
- **Supervisar** — el tablero de siempre: KPIs, filtros por estado, mapa con el panel de
  Atención al lado y la tabla por espacio. Lleva un contador de pendientes en el
  interruptor, así que invita solo.

El mercaderista **no ve el interruptor**: no vende, y su pantalla es Supervisar.

**El periodo es uno solo.** La misma tira de temporadas que pinta el mapa llena después
las fechas del contrato, así no hay dos calendarios que puedan discrepar. Al entrar a
Vender se pone solo en hoy→30 días si no había ninguno: "hoy" no es una pregunta
comercial, lo que se vende es una temporada.

**El contrato** (`frontend/src/components/Contrato/`) está partido en un hook con el
estado (`useContrato`) y dos piezas para dibujarlo. El botón de guardar **no vive adentro
del formulario** sino en una barra pegada al pie de la pantalla, que resume de corrido lo
que va a quedar escrito —espacio → proveedor → valor → fechas— y dice qué falta antes de
que nadie busque el botón. Para algo que escribe plata, esa relectura vale el espacio.

Detalles que sobrevivieron de la pantalla anterior porque se ganaron el lugar:

- Las fechas vienen **ya puestas** con el periodo elegido arriba, y se congelan al abrir
  la ficha: cambiar la temporada mientras alguien teclea no le reescribe el acuerdo.
- El semáforo del encabezado (`Libre todo el periodo` / `Parte del periodo vendida`)
  responde por **las fechas que están escritas**, no por el periodo con el que abrió. Si
  se corre el "hasta" hasta pisar un contrato que ya existe, el aviso aparece ahí mismo.
- Debajo del valor va la comparación contra la **tarifa de referencia**.
- Al lado del código va **dónde queda** en palabras ("A unos 3 m de las neveras"), medido
  de borde a borde. El mapa está al lado, pero al teléfono con el proveedor hay que poder
  decir "es la punta de la entrada, no la del fondo".
- Una **góndola doble son dos espacios**: la ficha trae el selector de cara A/B.
- Un mueble no comercializable no abre contrato: la ficha explica que es parte del local.

Al guardar hace lo mismo que hacía el panel del plano —`find-or-create` del espacio y del
proveedor, `POST /leases`, y escribe el contrato en el JSON del layout— y muestra una
confirmación que **se queda hasta que la cierren**: al cerrar un trato lo que hay que ver
es a quién le llegó el aviso, y un mensaje que se va solo a los dos segundos no lo dice.
Esa confirmación vive en la pantalla y no en el formulario, porque al guardar el mueble
cambia de estado y eso desmontaba el mensaje justo cuando había que leerlo.

Desde **Supervisar** también se vende: el popover del mapa y el panel de detalle traen
"Negociar este espacio", que cambia de modo con ese espacio ya elegido.

### Tres cosas que estaban rotas y no se veían

Salieron recorriendo la negociación completa como la haría una persona, no leyendo código:

- **Los archivos del contrato nunca aparecían.** El popover y el panel de detalle buscaban
  el espacio por el código **corto** (`PUN-04`) mientras la base lo guarda completo
  (`NAVE-PUN-04`), así que `by-code` contestaba 404 siempre y la sección se rendía en
  silencio. El corto además se repite entre sedes.
- **El error al guardar era invisible.** Salía al pie del formulario, debajo de la nota y
  fuera de la parte visible de la ficha, mientras el botón que lo provoca vive en la barra
  de abajo: se tocaba «Guardar», el backend rechazaba el choque de fechas y en pantalla no
  pasaba nada. Ahora sale en la barra, al lado del botón.
- **La planometría de un contrato futuro no se veía.** El endpoint respondía sólo por el
  contrato que corre hoy, así que el recién vendido para la temporada que viene —que es
  cuando más se consulta— no tenía ninguna. Ahora responde el vigente o, si no hay, el
  próximo. Los vencidos no: «así debe quedar» de algo ya desmontado no es una respuesta.

### Carga masiva desde una planilla

La temporada se negocia en una reunión y queda en un Excel con cuarenta filas. Cargarlas de
a una por el mapa es media tarde de trabajo y, peor, media tarde de oportunidades de
equivocarse.

**El archivo lo lee el navegador** (`frontend/src/utils/planilla.ts`, con la librería de
Excel que la app ya usaba para ver adjuntos) y al servidor le llegan filas en JSON. Así el
backend no aprende a abrir hojas de cálculo —una dependencia más para tres tiendas— y de
paso un CSV entra por el mismo camino sin escribir nada.

**Dos pasos, `validar` y `confirmar`** (`backend/app/routers/bulk_leases.py`):

- `validar` **no escribe nada**. Devuelve un veredicto por fila —qué mueble resolvió, qué le
  falta, con qué choca— para que la revisión ocurra antes de crear cuarenta contratos y
  disparar los correos. Una importación a ciegas que sale mal no se deshace con un botón.
- `confirmar` **vuelve a validar**: entre la revisión y el botón alguien pudo vender uno de
  esos espacios desde el mapa, y crearlo igual dejaría dos proveedores en la misma punta.
  Crea sólo lo que pasa; una fila mala no tira abajo las treinta y nueve buenas.

**La planilla es la que trae la gente, no un formato.** Los encabezados se reconocen por
sinónimos (`Código`/`Espacio`, `Renta`/`Valor mensual`, `Fecha inicio`/`Desde`), la fila de
títulos no tiene que ser la primera —las planillas suelen arrancar con un título—, y hay
plantilla descargable para quien la quiera.

Las fechas se leen **día primero**: `03/04/2026` es el 3 de abril. Es la convención local, y
leerlo al revés no falla ruidosamente: crea un contrato de tres meses en el mes equivocado
sin que nada avise. Los montos aceptan `$1.800.000`, `1800000` y `1,800,000`; un separador
único seguido de exactamente tres dígitos es de miles, porque `1.800` son mil ochocientos
pesos y no un peso con ochocientas milésimas.

**Qué se rechaza y qué sólo se avisa.** Error (la fila no entra): código que no existe en el
plano, mueble no comercializable, falta proveedor/valor/fechas, fechas al revés, choque con
un contrato existente y **choque con otra fila del mismo archivo** —el error más fácil de
cometer en una planilla y el más difícil de ver leyéndola—. Aviso (entra, pero se mira): el
valor 15% o más por debajo de la tarifa de referencia, y un correo con formato dudoso, que
se descarta en vez de guardarse mal.

Acá se es **más estricto que en el alta de a uno**: ahí un código sin mueble en el plano se
acepta —hay filas sembradas y muebles borrados después del contrato— pero en una planilla es
un tipeo, y crearlo callado deja un contrato colgado de un espacio fantasma que nadie va a
montar.

«Proveedor nuevo» se dice pero **no pinta la fila**. En una planilla de temporada casi todos
lo son, y cuarenta filas en amarillo entrenan a la gente a ignorar el amarillo —que es el
color reservado para lo que sí hay que mirar—.

**Los avisos van agrupados**: un correo al comercial con la tanda completa, uno al
mercaderista con la lista a montar (sin valores) y una constancia por proveedor con todos
sus espacios. Cuarenta contratos por el camino de a uno serían ciento veinte correos en un
minuto: nadie los lee y el proveedor de correo los trata como spam.

Tope de 300 filas por archivo. No es una limitación técnica: una planilla que no se puede
revisar en pantalla no se puede aprobar con criterio.

### La planometría

Cómo debe quedar armada la exhibición: la foto o el PDF que manda el proveedor.
**Cuelga del contrato, no del mueble** (`lease_files`, tabla nueva).

La misma punta de góndola recibe una planometría distinta cada vez que se alquila —cambia
con el proveedor y con la temporada—, así que guardada en el mueble habría **un solo
casillero que se sobreescribe**: al entrar Nutresa se pierde la de Alpina, y con ella la
única prueba de qué se acordó armar en septiembre. Colgada del contrato, cada acuerdo
lleva la suya y el histórico queda.

Tabla propia y no `space_files` con una marca en el nombre, aunque eso ya se hizo una vez
para las fotos de montaje: `list_face_images` toma la imagen más reciente de un espacio
para pintar el panel del 3D, y una planometría ahí adentro volvería a secuestrar las artes
del proveedor. Con tabla propia eso es imposible por construcción, no por convención.

Quién la ve, y por dónde llega:

| Quién | Cuándo | Cómo la encuentra |
|---|---|---|
| Admin | al cerrar el trato | la adjunta en el formulario; se sube después de crear el contrato |
| Admin | después | detalle del espacio en Supervisar — puede cambiarla o quitarla |
| Mercaderista | al montar | `GET /planometrias/por-espacio/{code}` |

El mercaderista llega **por el código del espacio**, no por el id del contrato: el enlace
del correo trae el código y no tiene por qué saber que existen contratos. El backend hace
el salto espacio → contrato **que corre hoy** → archivo, y por fechas y no por la bandera
`is_active`, que se queda en True desde que el contrato se crea.

Detalles que se ganaron el lugar:

- **Una por contrato.** Cargar otra reemplaza la anterior: dos verdades sobre cómo debe
  quedar el mismo mueble es justo lo que este archivo existe para evitar.
- **Si la subida falla, el contrato igual queda.** Ya se guardó y los correos ya salieron;
  se avisa en la confirmación y se puede cargar después desde el detalle del espacio. Ese
  mismo camino es el único que tienen los contratos anteriores a que esto existiera.
- **Se acepta PDF además de imagen.** La mitad de los proveedores manda la exhibición en
  PDF. El filtro compara contra una lista **cerrada** y nunca contra `image/*`: un SVG es
  una imagen para el navegador y un documento con scripts para todo lo demás, y esto se
  sirve inline desde el mismo origen que la app.
- **El archivo no se borra al vencer el contrato.** Es la prueba que responde un reclamo
  meses después, igual que la confirmación de montaje.

### Cancelar un contrato

`DELETE /spaces/{id}/leases/{id}` existía desde siempre y **ninguna pantalla lo llamaba**.
El agujero se veía en el propio mensaje de choque de fechas —«Cancelalo primero o ajustá
las fechas»— que mandaba a hacer algo que la aplicación no permitía.

Ahora está en el detalle del espacio (Supervisar → tocar el mueble → Ver todo), sólo para
admin y con confirmación. Cancela el que corre hoy o, si no hay, **el que ya está firmado
y todavía no arranca**: ése es el que hay que soltar cuando un proveedor se cae antes de
empezar, y era el más difícil de alcanzar porque su id no salía en ninguna respuesta —
`SpaceOut` ahora expone `upcoming_lease`, que sale de una property del modelo y **no es
una columna nueva**. La redacción para el mercaderista cubre las dos: agregar el próximo
sin tacharle el valor habría abierto por la ventana lo que la app cierra por la puerta.

Al cancelar se escribe también el JSON del layout. Sin eso el contrato desaparece de la
base y el mueble sigue pintado como vendido en el mapa, que es de donde salen todas las
pantallas. La planometría y el reporte de montaje **no se borran**: son la prueba de lo
que se acordó y de lo que se armó.

### El contrato tiene un solo dueño

El contrato se llenaba en **tres** lugares: el panel del plano 2D, el panel del editor 3D
y la pantalla de venta. Los dos primeros ya no lo hacen, y no era una duplicación inocente:

- los campos escribían el **JSON del layout** sin tocar la base, así que se podía dejar un
  proveedor y un valor puestos en el mapa sin que existiera ningún `SpaceLease`;
- el botón "Guardar contrato" llamaba a `createLease` **cada vez que se tocaba**. No editaba
  nada: corregir una fecha y volver a guardar creaba un segundo contrato sobre el mismo
  espacio. No hay endpoint de edición de contratos —sólo alta y baja—, así que la
  "edición" que se perdió al sacarlos nunca existió.

Ahora la división es por lo que cada pantalla sabe:

| | Plano 2D · Editor 3D | Sede → Vender |
|---|---|---|
| Diseño | destino, sede, nomenclatura, dimensiones, rotación, artes/archivos, observación | — |
| Comercial | lo contratado, **de sólo lectura**, con un puntero a dónde se cambia | proveedor, marca, correo, valor, fechas, nota |

El panel del plano muestra quién tiene el espacio, hasta cuándo y por cuánto (esto último
sólo para el admin), y dice que se cambia en Sede → Vender. El editor 3D, igual.

**Las pestañas dicen para qué sirven.** Los nombres solos no alcanzaban —"Plano" y
"Editor 3D" suenan a lo mismo, y desde ninguno se adivina que el contrato se llenaba ahí
adentro—. Hay una frase en el tooltip de cada una y una línea que separa el trabajo diario
(Sede · Montajes) del diseño de la tienda (Plano · Editor 3D), que es donde se entra una
vez cada tanto. El admin aterriza en **Sede**, modo Vender.

**El correo del proveedor ya se puede cargar.** El formulario lo pide, y
`/suppliers/find-or-create` **completa** el que falta sin pisar el que ya está. Antes no
había forma de cargarlo desde la interfaz, así que el tercer aviso —la constancia al
proveedor— no salía nunca.

### Pantalla de negociación: del contrato al montaje

Guardar un contrato ya no termina en la base: dispara **tres correos distintos según a
quién le sirve qué** (`backend/app/routers/spaces.py`).

- **Comercial** (administrador de sede, gerente operacional): el contrato completo, con
  el valor.
- **Montaje** (el mercaderista): el mismo espacio **sin un solo monto**, y un enlace
  directo `.../?montar=SEDE-CODE`.
- **Proveedor**, si tiene correo cargado: confirmación de lo suyo.

Los destinatarios viven en `app_config` bajo `notify_contacts`, por sede y por rol
(`backend/app/services/contacts.py`), y se editan desde Configuración. Si están vacíos
cae al `notify_emails` de siempre.

El enlace abre `MountView` (`frontend/src/pages/MountView.tsx`) en el celular: tarjetas
grandes ordenadas por urgencia — lo que ya arrancó primero —, dos botones del tamaño de
un pulgar y la cámara a un toque. El worker es el único rol que escribe algo en el
sistema, y solo esto: `POST /mounts/`. Un "no pude" **exige motivo**, porque sin motivo no
se sabe a quién reclamarle.

**Dónde queda.** Antes de preguntar nada, la pantalla muestra el plano de la tienda con el
mueble señalado (`components/MiniMapa/`) y la ubicación escrita — *"A unos 4 m de las
cajas"*. Tres decisiones que vale la pena conservar:

- **Cenital, no isométrico.** El mapa isométrico del Dashboard extruye por altura y pinta
  de atrás hacia adelante, así que tapa justo los muebles chicos —bateas, ristras— que son
  los que cuesta encontrar. Y para "estoy acá, tengo que llegar allá" la convención que
  todo el mundo ya sabe leer es la del directorio de centro comercial.
- **El alto sale de la forma de la planta**, no es fijo. Con alto fijo, una tienda larga y
  angosta —la forma normal de un supermercado— se dibujaba a menos de 5 px por metro y una
  punta de góndola quedaba de cuatro píxeles: se veía, no se podía usar.
- **Las referencias salen de los datos, no del aire.** Las cajas y las neveras se etiquetan
  porque existen como muebles. No hay flecha de norte ni "entrada" porque el sistema no
  guarda ninguna de las dos cosas, y ponerlas sería inventarle información a alguien que
  está parado en un pasillo.

El mapa busca por el código CRUDO del mueble contra el mismo arreglo del que salió, nunca
por el `SEDE-CODE`: la nomenclatura corta se repite entre tiendas y buscar suelto devuelve
el mueble de la sede equivocada. Si el mueble no está en el layout —contrato sobre un
espacio que después se borró del plano— el mapa se omite entero en vez de mostrar uno que
no señala nada.

**La distancia se mide de borde a borde, nunca de centro a centro.** No es una sutileza de
implementación: en NAVE la pared de refrigerados está dibujada como UN mueble de 26 m de
ancho, así que su centro queda a media tienda de sus propios extremos. Midiendo al centro,
a una punta que está a 3 m de la nevera se le decía "a 8 m" — y con esa frase se camina
para el lado equivocado. Con los datos reales de NAVE, el centro se equivocaba en **11 de
los 19** espacios alquilables. Por lo mismo el encuadre del plano usa la huella de cada eje
por separado: usar `max(w, d)` para los dos lados —que parecía lo seguro— inflaba el
recinto al doble de alto por culpa de ese mismo mueble, y dibujaba todo más chico de lo
necesario justo donde hay que encontrar una punta de 90 cm.

El correo de montaje lleva la ubicación **escrita**, no dibujada: Gmail descarta el SVG
embebido, un PNG obligaría a rasterizar en el servidor y una imagen servida por la app
pediría token. El texto llega intacto a cualquier cliente, y el plano vive del otro lado
del enlace. La frase la calcula `describe_location` en `services/layout_lookup.py`, que
espeja `describirUbicacion` del cliente — si las dos se separan, el mercaderista lee una
cosa en el correo y otra en la pantalla.

**La foto es obligatoria** cuando se reporta "montado", en el servidor y en la pantalla:
"montado" sin foto es una afirmación sin respaldo, y es exactamente lo que el proveedor
discute meses después. Al "no pude" **no** se le exige: si el material nunca llegó puede no
haber qué fotografiar, y dejar sin reportar un problema es peor que quedarse sin la foto.

Alrededor de esa regla hay cuatro defensas, todas porque bloquear al mercaderista es peor
que no tener la función:

- Se aceptan **HEIC/HEIF**: es lo que sale de un iPhone cuando iOS no convierte al subir.
  Rechazarlo dejaría a esa persona sin poder reportar nada desde su propio teléfono.
- La foto se **reduce en el navegador** a 1600 px y JPEG antes de salir (`utils/foto.ts`),
  con red: ante cualquier error se sube el original. Incluye un chequeo de lienzo uniforme,
  porque un HEIC que no se decodifica no lanza error — produce un JPEG negro perfectamente
  válido, y eso es peor que un rechazo: la prueba queda guardada y no muestra nada.
- Hay **timeout de subida**; sin él, una conexión colgada dejaba el botón muerto para
  siempre y la única salida era recargar, que perdía la foto.
- Se puede **elegir de la galería**, no solo tomarla: `capture` manda directo a la cámara y
  en Android saca la opción de galería, lo que dejaba atrapado a quien montó sin señal y
  volvió a reportar más tarde.

Y como la foto movida es lo más normal del mundo, el aviso de "ya se reportó" ofrece
**corregir el reporte**: el histórico guarda todos y vale el último. Sin eso, la prueba que
el proveedor va a discutir en tres meses queda siendo la primera que salió.

Dos detalles que no son obvios y que conviene no deshacer:

- **El tipo de archivo se valida contra una lista cerrada, nunca contra `image/*`.** Un SVG
  es una imagen para el navegador y un documento con scripts para todo lo demás; guardado
  como foto y servido inline desde el mismo origen que la aplicación, ejecutaría JavaScript
  con la sesión de quien lo abra.
- **La foto de montaje lleva un prefijo reservado en el nombre** (`montaje--`) y
  `list_face_images` la excluye. Se cuelga del mismo `Space` que las artes del proveedor, y
  el editor 3D usa la imagen *más reciente* de cada espacio como planograma: sin la marca,
  la foto del anaquel tomada de costado reemplazaba la textura de la góndola en la pantalla
  del comercial — y con la foto obligatoria, en cada contrato.

Se guarda **una fila por reporte**, no una por espacio (tabla nueva `mount_confirmations`,
permitida por la regla: `create_all` sí crea tablas). El histórico de quién dijo qué y
cuándo es justamente lo que contesta cuando el proveedor reclama meses después. La hora la
pone el servidor: el EXIF de un celular se edita.

Borrar una sede **archiva** sus confirmaciones (`archivado_en`) en la misma transacción que
archiva sus contratos. No se borran —son prueba— pero dejan de contar: una sede recreada
con el mismo nombre reusa los mismos códigos y heredaría los "montado" de la anterior.
Cubierto en `backend/tests/test_mounts.py`.

### Bugs preexistentes corregidos

Los tres se encontraron levantando la app contra datos sembrados, no leyendo código:

- **El plano 2D subía un layout vacío** ~16 ms después de montar, antes de que llegara la
  respuesta del servidor. Desde un navegador con `localStorage` limpio, abrir la app
  **vaciaba la sede en el servidor**. Es la causa de fondo del problema de sincronización
  original: no es que los cambios no viajaran, es que el otro equipo los borraba al entrar.
- **El editor 3D borraba `faceB` y `nomenclatura`** de todos los fixtures con solo abrirse,
  y subía la pérdida.
- **El proxy de Vite quitaba el prefijo `/api`** que el backend sí monta, así que
  `npm run dev` nunca pudo hablar con un backend local.

---

### Qué hay de verdad en los planos (agosto 2026)

Medido contra producción, porque el mapa del montaje vale lo que valga la fidelidad del
plano y eso no se puede suponer:

| Sede | Muebles |
|---|---|
| NAVE | 104 |
| POBLADO | 104 |
| CENTRO | 48 |
| NORTE | 6 |
| ciudad jardin | 1 |
| TERRON | **0** |
| SUR | 0 |

**NAVE está a escala, y bien.** Huella de 42,4 × 15,8 m (669 m²), con los muebles ocupando
el 29 % del recinto — proporción normal de un supermercado con sus pasillos. El 92 % de los
muebles tiene medidas propias, no la del catálogo: alguien midió. Las coordenadas caen en
la grilla de 5 cm del editor (86 %) y **ninguna** en metros enteros, que es la firma de un
plano medido y no de uno acomodado para que se vea lindo. Solo 2 pares de góndolas se pisan
(GON-46/GON-48 y GON-60/GON-67) y no hay muebles apilados en la misma coordenada.

Dos cosas que conviene saber antes de tocar el mapa:

- **Los muebles largos se dibujaron como uno solo.** La pared de refrigerados es un único
  `nevera_refrescos` de 26,05 m; hay otro de 10,05 m y un `nevera_carnes` de 6,05 m. Es una
  representación razonable de una corrida continua, pero rompe cualquier cálculo que trate
  al mueble como un punto.
- **Hay 12 muebles de referencia** en NAVE (5 cajas, 3 neveras de refrescos, 3 stands de
  frutas, 1 mostrador de carnes), así que la frase de ubicación y las etiquetas del mapa
  tienen de dónde salir. En una sede donde solo se dibuje lo alquilable no habría ninguna:
  ahí el mapa sigue funcionando, pero sin etiquetas ni frase.

De los 104 muebles de NAVE, **19 son comercializables**. El resto es infraestructura, que es
justo lo que hace legible el mapa: contexto en gris y todo el color en el destino.

---

## El 3D asumía una tienda que no existe

El editor 3D nació con un local ficticio de **30 × 42 m anclado en el origen**, en dos
constantes: `STORE_W` y `STORE_D`. Todo colgaba de ahí — por dónde se puede caminar, dónde
se dibuja la grilla, hasta dónde llega el piso que recibe los clics, adónde apunta la luz.

Ninguna sede real cabe en esa caja. NAVE ocupa **47,4 × 20,8 m y empieza en x = −25,4**: de
sus 104 muebles, **48 (el 46 %) quedaban fuera** y eran literalmente inalcanzables a pie. La
mitad izquierda del supermercado no se podía visitar. Al mismo tiempo sobraban 30 m de piso
vacío hacia el fondo, porque la caja se estiraba hasta z = 44 donde la tienda termina en
13,3.

Ahora la extensión del local **se deduce de los muebles**, en `frontend/src/utils/planta.ts`.
El módulo es geometría pura y vive fuera del componente a propósito: así se puede probar sin
montar Three.js ni un navegador (`npm run probar:planta`, 15 pruebas).

**La huella de un mueble se calcula rotada.** El helper de colocación (`getAABB`) ignora
`rotY` porque los muebles se colocan sin girar, pero para caminar no se puede: 63 de los 104
muebles de NAVE son góndolas y la mayoría están giradas 90°. Sin la rotación, una góndola de
3,6 m de largo se lee como si midiera 0,9 m y uno la atraviesa caminando.

### Caminar

- **Los muebles frenan.** Antes no había colisión de ninguna clase: se atravesaban las
  góndolas. El choque se resuelve **por eje**, así que uno resbala a lo largo de la góndola
  en vez de clavarse contra ella.
- **El paso se mide en metros por segundo**, no por frame. Eran `0,08` por frame — a 60 fps,
  4,8 m/s, o sea trotando, y en una pantalla más rápida iba más rápido todavía. Ahora son
  1,4 m/s caminando y 3,2 con Shift.
- **El paso se recorre en tramos cortos** (`PASO_MAXIMO = 0,2 m`). El choque se mide punto a
  punto, así que un paso más largo que el obstáculo lo saltaba limpio. Hoy un paso dura como
  mucho 0,32 m y lo más delgado que hay —una columna de 30 cm— mide 0,86 m ya inflada por el
  radio del cuerpo, así que no pasaría; pero eso dependía de que nadie subiera la velocidad.
- **Se entra por un lugar libre.** El centro del local, o el primer punto despejado buscando
  en espiral: nadie aparece dentro de una góndola.
- **La Zona Libre se pisa.** Lo que mide menos de 25 cm de alto es una marca en el piso, no
  un obstáculo. Es una regla por altura, no una lista de tipos, así que un mueble bajo nuevo
  queda bien solo.
- **Quien queda dentro de un mueble puede salir.** Si alguien coloca una góndola encima
  mientras se camina, frenarlo ahí lo dejaría atrapado para siempre.

### Lo que se veía mal por lo mismo

- **La grilla y el piso que recibe clics** estaban centrados en la tienda ficticia. Un
  pedazo del local quedaba sin piso: hacer clic ahí no hacía nada.
- **Arrastrar un mueble** estaba topado en `x ≥ 0`, así que la mitad izquierda de una sede
  real no se podía editar.
- **La luz y su cámara de sombras** apuntaban al centro de la caja: la sombra se recortaba
  justo donde empieza la mitad izquierda de NAVE.
- **La advertencia de "góndola mural cerca de una pared"** salía siempre, porque medía
  contra x = 30 / z = 42 en vez de contra donde terminan los muebles.
- **El encuadre al abrir.** Una cámara guardada apuntando al centro de la tienda ficticia
  (15, 21) dejaba la sede arrinconada en una esquina de la pantalla. Ahora se reencuadra
  siempre que la mira caiga fuera del local; si el usuario la dejó adentro, se respeta.
- **Salir de la caminata no devolvía la vista.** Faltaban dos cosas que ya faltaban antes:
  `update()` en los controles —sin él la cámara conserva la rotación de la caminata y sigue
  mirando la góndola que uno tenía enfrente— y un `invalidate()`, porque el lienzo sólo
  renderiza bajo demanda y el cuadro nuevo nunca se dibujaba.

### El minimapa y el teletransporte

Lo que hace abandonar un recorrido en primera persona no es que se vea feo: es no
saber dónde uno está parado. El minimapa es el préstamo más directo que hay de los
videojuegos y resuelve exactamente eso.

**Es el mismo `MiniMapa` de la pantalla del montaje**, no uno nuevo. Se le agregaron dos
cosas y el resto quedó igual:

- `camara={{ x, z, dirX, dirZ }}` dibuja el "usted está aquí" con su cono de visión. Se le
  pasa el **vector** de dirección y no un ángulo a propósito: el 3D lo saca de
  `camera.getWorldDirection()` y así nadie tiene que acertarle desde afuera a la convención
  de Euler de Three.js.
- `onIrA(x, z)` vuelve el plano entero elegible **por posición y no por mueble**, y devuelve
  metros. Ése es el teletransporte.

`targetCode` pasó a ser opcional: la caminata no señala ningún mueble en particular.

**Dónde aterriza el salto.** En el lugar despejado más cercano a lo que se tocó
(`puntoLibreCerca`, el mismo que elige por dónde se entra). Quien apunta al medio de una
góndola quiere el pasillo de al lado, no que no pase nada. La mirada no se toca: uno salta,
no gira.

**Por qué el salto pide soltar el mouse.** Con el puntero capturado el navegador lo esconde
y manda todo al lienzo: no hay cursor que pueda tocar un `<div>`. Así que el minimapa
siempre orienta, pero sólo se vuelve clickeable con el mouse suelto — `Esc`, clic en el
plano, y clic en el lienzo para seguir caminando. Es el mismo patrón de cualquier juego que
abre el mapa grande soltando el control.

**Un bug que sólo se veía estando quieto.** El lienzo corre con `frameloop="demand"`:
dibuja cuando alguien se lo pide. `PointerLockControls` mueve la cámara en el `mousemove`,
fuera del bucle de cuadros, y nadie pedía el redibujo — así que **parado y mirando alrededor
la imagen quedaba congelada** hasta tocar una tecla de movimiento. Caminando no se notaba,
porque el propio paso pedía el cuadro. Se arregla enganchando `invalidate()` al `change` del
control.

**El minimapa no re-renderiza 60 veces por segundo.** La posición se informa sólo cuando uno
se movió más de 12 cm o giró lo suficiente; caminando eso son unas pocas veces por metro.

Y de paso: las etiquetas de referencia se calculaban 5 px por letra, pero van en negrita, en
mayúsculas y con `letter-spacing`. Con esa cuenta "CARNES" y "NEVERAS" pasaban el filtro de
choque en NAVE y se dibujaban una encima de la otra igual. Ahora son 6,5.

---

## Las cuatro del proveedor

El 3D dejó de ser una maqueta bonita: es con lo que se le muestra a un proveedor
qué está comprando.

### Ver la exhibición en 3D

Un botón en la ficha del espacio —tanto en el formulario de negociación como en la
ficha de detalle— lleva al Editor 3D **encuadrando ese espacio**. Antes había que
entrar a mano y buscarlo entre 104 muebles.

El pedido viaja por el store (`enfoque3D`) porque la pantalla de sede y el editor 3D
son pestañas hermanas sin props entre ellas. Se identifica **por id de mueble y no
por código**: el código corto se repite entre sedes y a veces llega con el prefijo
puesto y a veces no.

**Cómo se calcula el encuadre.** En la caja de Three.js el orden de materiales es
`[+X, −X, +Y, −Y, +Z, −Z]`, y el editor pinta la cara A en el índice 5 y la B en el
4: la **cara A mira a −Z y la B a +Z** en coordenadas locales, y después el mueble
gira `rotY`. La cámara se para de ese lado, a la distancia que necesita el campo
visual para que la exhibición entre llena, y nunca por debajo de 1,65 m — una batea
de 80 cm mirada desde 40 parece una foto tomada en el piso.

Un detalle que costó una prueba: **la cara mide `w` × `h` siempre**. Es una cara de
la caja, abarca los ejes locales del mueble; girarlo cambia hacia dónde apunta, no
cuánto mide. No confundir con `huella`, que sí intercambia ancho y fondo porque
describe la caja alineada al mundo.

### Vistas guardadas por espacio

Con un mueble seleccionado, el panel derecho ofrece guardar la cámara actual como
**la** vista de ese espacio y esa cara. Al enfocarlo de nuevo abre en ese ángulo; sin
vista guardada, en el encuadre calculado. Se puede olvidar.

Vive en el JSON del layout (`vista3D` por mueble, por cara), así que viaja al
servidor y aparece en la laptop del que arma la propuesta. **Sin migración.**

Dos cuidados:

- `fixturesToStore` tiene que arrastrarla. El 3D no la modela, y sin esa línea
  **mover un mueble borraba todos los encuadres de la sede** y le mandaba la pérdida
  al servidor.
- Guardar y borrar escriben el layout pero **no entran al historial**: que Ctrl+Z
  deshaga un encuadre de cámara mezcla dos cosas que no tienen nada que ver.

Se guarda la cámara ORBITAL. En primera persona la cámara no se persiste —la
caminata escribiría cientos de veces por recorrido— así que el botón lo avisa en vez
de guardar algo viejo.

### Antes / después del arte

Un interruptor en la barra apaga las artes del proveedor. El «antes» es el mueble
**pelado**: ni la foto ni el patrón de categoría, que es contra lo que se compara la
marca puesta.

### La lámina para el proveedor

El botón de captura bajaba un volcado crudo del lienzo. Un PNG suelto sin sede, sin
código de espacio y sin período no se puede adjuntar a nada: el que lo recibe no sabe
si es su punta de góndola o la de al lado.

Ahora, con un mueble elegido, saca **dos tomas desde la misma cámara** —sin arte y
con arte— y las compone con un pie que dice proveedor, categoría, período, valor y
mueble. La plata se tacha para el rol trabajador, igual que en el resto: una lámina
es un archivo que se reenvía.

Tres cosas que sólo se vieron mirando el archivo que salía:

- **El PNG salía en blanco.** El lienzo no se creó con `preserveDrawingBuffer`, así
  que el búfer se limpia al componer y un `toDataURL` suelto no lee nada. Hay que
  dibujar y leer en el mismo turno.
- **El gizmo y la caja de selección salían en la foto.** Apagarlos por estado de
  React deja la captura a merced de cuándo React confirma el cambio, y el gizmo
  aparecía en la primera de las dos tomas. Se marcan con `userData.chrome` y los
  esconde la propia captura, sincrónicamente.
- **Sin arte cargada las dos tomas salen idénticas.** Mostrar el mismo dibujo dos
  veces rotulado «Hoy» y «Con la marca» es mentirle al que recibe la lámina: ahí va
  una sola imagen.

### Y un gizmo que nunca se dibujó

`TransformControls` dejó de ser un `Object3D`: en three 0.184 extiende `Controls`, y
lo que va a la escena es su ayudante (`getHelper()`). El `as unknown as THREE.Object3D`
que había silenciaba el error de tipos pero no el de runtime — la escena rechazaba el
objeto y **la flecha para mover un mueble nunca se dibujó**. Sólo se veía al
seleccionar, que hasta ahora era raro; con «Ver en 3D» seleccionando solo, saltó a la
primera.

---

## El plano, que es donde empieza todo

De acá salen los espacios que se venden, el metraje que se cobra, el recorrido
que se le muestra al proveedor y el mapa con el que el mercaderista encuentra la
exhibición. Un error acá no se nota hasta que ya viajó a un contrato.

**El plano de NAVE está sano** — se midió antes de tocar nada: 104 muebles, 0
códigos repetidos, 0 prefijos mal puestos, se camina entero con hombro de 1,20 m
y sólo dos roces de 0,01 y 0,03 m². El problema no eran los datos: era que el
editor no protegía lo que alguien había hecho a mano.

### Una sola nomenclatura

Había dos, una por editor. El plano 2D generaba `GON-01` con `max + 1`; el editor
3D generaba `NAVE-GON-001` **contando** cuántos había. Contar no es lo mismo que
buscar el siguiente libre: con `GON-01` y `GON-03` en el plano, contaba 2 y
devolvía `GON-03` otra vez. **Dos muebles con el mismo código son dos espacios
compartiendo contratos, archivos y correos de montaje.**

Ahora viven en `utils/nomenclatura.ts`, los usan los dos editores, y el código
devuelto es el primer número **libre** —no `max + 1`, que bastaba una edición
manual para hacerlo chocar. La sede no va en el código: se antepone al guardar el
espacio (`fullSpaceCode`), que es donde hace falta que sea único entre sedes.

Editar un código a mano tampoco puede pisar a otro: el campo se tiñe y no cierra.

### Juntos sí, encima no

Los dos editores comparaban cajas **sin rotar**. El 2D zafaba porque intercambia
ancho y alto al girar, así que sus medidas ya vienen giradas; el 3D no, y la
mayoría de las góndolas de una sede real están giradas 90°: una de 3,6 × 0,9 se
leía como 0,9 de ancho y se podía soltar atravesada sobre otra.

Peor: en el 3D **el fantasma se pintaba rojo y el clic soltaba el mueble igual**.
El aviso era decorativo. El plano 2D siempre lo bloqueó.

La regla ahora es una y explícita, en `TOLERANCIA_CONTACTO` (2 cm):

- **Hasta 2 cm es contacto.** Una corrida se arma poniendo las góndolas al ras y
  eso tiene que salir siempre. Con «cero solape» bastaba el ruido de coma
  flotante de una rotación —`cos(90°)` da 6·10⁻¹⁷, no 0— para que el editor se
  negara a dejarlas juntas. Dos centímetros es menos que la grilla de 5 cm con la
  que se dibuja: por debajo de eso nadie lo puso ahí a propósito.
- **Por encima es un mueble sobre otro**, y se bloquea.

### Pasillos

Un supermercado no se recorre por códigos sueltos. Quien negocia dice «la punta
del pasillo 3», no «PUN-07».

El plano ya tenía esa estructura y el editor no la conocía: las 56 góndolas
principales de NAVE forman **10 corridas limpias**, y quien lo dibujó las numeró
en orden. `utils/pasillos.ts` lo deduce de la geometría agrupando por la
coordenada perpendicular, y el resultado **coincide con lo que hizo la persona a
mano**: nueve de las diez corridas calzan exactamente con los códigos existentes,
y cada pasillo recibe sus dos puntas, una por cabecera. Los 18 muebles sin
pasillo son la pared perimetral, las cajas y las zonas libres — que efectivamente
no están en ningún pasillo.

**No se guarda: se deduce.** Mover una góndola cambia su pasillo, y un dato
guardado se quedaría viejo sin que nadie se entere.

**El código no lleva el pasillo, a propósito.** El código es la llave de los
contratos, los archivos, los correos de montaje y los enlaces ya enviados:
renombrar `GON-17` a `P03-GON-05` huerfaniza todo eso y obliga a migrar `spaces`,
`space_files` y `space_leases`. El pasillo se muestra al lado.

### Revisar antes de negociar

Un botón en la barra del plano abre `utils/revision.ts`, que reporta:

| | |
|---|---|
| Códigos repetidos | error — dos espacios compartiendo historia |
| Muebles encimados | error arriba de 0,05 m², aviso debajo |
| Pasillos angostos | error si no pasa una persona (0,56 m), aviso si no pasa un carrito (0,90 m) |
| Prefijo que no corresponde al tipo | aviso |
| Piso encerrado entre muebles | aviso — se ve en el plano pero no se puede caminar |

Cada hallazgo salta al mueble. Sobre NAVE reporta exactamente los dos roces
reales y nada más; los huecos entre sus pasillos van de 1,30 a 2,80 m.

### Los atajos: por qué «a veces andaban»

**Duplicar fallaba para 11 de los 17 tipos del catálogo, en silencio.** `Ctrl+D`
desplazaba la copia 0,5 m en los dos ejes y la descartaba si chocaba. Una Góndola
Doble mide 0,90 × 0,90: la copia siempre se solapaba con su original, se tiraba, y
no pasaba nada ni se avisaba. Andaba sólo para los seis tipos que miden menos de
50 cm en alguno de sus lados (mural, punta, robatope, ristra, impulsador,
columna). De ahí el «a veces funciona».

Ahora la copia cae **al ras al lado**, que es para lo que se usa el atajo: seguir
armando una corrida. Si no hay lugar, lo dice.

**Pegar pegaba encima.** `Ctrl+V` probaba cinco desplazamientos en diagonal y, si
ninguno servía, pegaba igual sobre lo que hubiera. Ahora busca de verdad y el
grupo se mueve entero, así que media corrida copiada vuelve como media corrida.

**⌘Z no andaba en Mac.** Deshacer y rehacer miraban sólo `ctrlKey`, mientras que
⌘A, ⌘D, ⌘C y ⌘V sí aceptaban `metaKey`. Ahora todos aceptan los dos.

**`R` rotaba de más y de menos.** Sin guarda de modificadores, `Ctrl+R` (recargar)
también rotaba; y sólo giraba si había EXACTAMENTE un mueble elegido, así que con
dos o más no hacía nada y no decía por qué. Ahora exige que no haya modificadores
y gira toda la selección.

**El plano no tenía ningún aviso.** Un atajo que no hacía nada era indistinguible
de uno que no existía. Ahora cada acción confirma en pantalla —«3 muebles
duplicados», «No hay lugar libre cerca»— y borrar recuerda que `Ctrl+Z` existe.

### Dónde están escritos

Un botón **Atajos** en la barra del plano abre la lista completa, agrupada por
para qué sirve. La barra de estado muestra un resumen **sacado de la misma
constante**, así que no se pueden desfasar.

Antes la única ayuda era esa línea de la barra: con `white-space: nowrap` y
`text-overflow: ellipsis` se cortaba en una ventana angosta, y de entrada no
mencionaba deshacer, duplicar, copiar, pegar ni Escape. (Hay un `ZoneEditorPanel`
con una lista de atajos en `components/FloorMap/`: es código muerto, no lo importa
nadie.)

---

## El correo de un contrato

Guardar un contrato dispara **tres** correos, uno por rol:

| Para | Qué lleva |
|---|---|
| **Comercial** (gerente + admin de la sede) | resumen con el **valor mensual** |
| **Montaje** (mercaderista de la sede) | orden de trabajo **sin valores**, con dónde queda en palabras y el enlace `/?montar=SEDE-CODE` |
| **Proveedor** | constancia de lo acordado, con el valor. Sólo si tiene correo cargado |

Los destinatarios salen de la libreta (`notify_contacts` en `app_config`), por sede
y por rol. Si está vacía se cae a la lista global vieja (`notify_emails`).

### La pantalla afirmaba lo que no había pasado

La confirmación decía **«Ya salieron los avisos: …»** como frase fija. Con el SMTP
sin configurar en el servidor —que es como viene `render.yaml`— o sin un solo
contacto cargado, decía exactamente lo mismo y no salía ni un correo.

Cerrar una negociación creyendo que se avisó al mercaderista, y que no se haya
avisado a nadie, es el modo de falla que vuelve inútil la herramienta.

Ahora `POST /spaces/{id}/leases` devuelve un bloque `avisos` con `smtp_listo` y las
direcciones por rol, y la pantalla dice lo que de verdad pasó: a quién se le avisó,
o que **no se avisó a nadie** y por qué. Reporta lo **encolado**, no lo entregado —
los envíos son tareas en segundo plano que corren después de responder— pero eso ya
es la diferencia entre «se intentó» y «se afirmó sin intentar».

### El aviso previo estaba muerto

`NotifyPreview` avisa **antes** de guardar si el correo no está configurado o si no
hay contactos para esa sede. Estuvo vivo hasta `64a30d2` y **quedó sin montar en
`12695c2`**, el commit que partió el contrato en un hook más piezas de
presentación: el componente siguió existiendo, nadie lo importó, y la pantalla pasó
a afirmar los avisos sin poder saberlo. Ahora vive en la ficha de Vender, justo
encima del botón de guardar, con los tokens claros de esa pantalla.

### El correo de prueba miraba la clave equivocada

`POST /notifications/test` leía **sólo** `notify_emails`, la lista global vieja, y
no la libreta de contactos de donde salen los avisos de verdad: con la libreta
llena respondía «no hay destinatarios» y nadie entendía por qué. Ahora junta las
dos y el mensaje incluye servidor, remitente y destinatarios, para poder verificar
la configuración sin adivinar.

### El hosting bloquea la salida SMTP

Se cargaron las credenciales de Gmail en Render y el botón de prueba falló. El log
del servidor lo resolvió en una línea:

```
File "smtplib.py", line 312, in _get_socket
  return socket.create_connection((host, port), timeout, ...
OSError: [Errno 101] Network is unreachable
```

Falló en `create_connection`: **nunca llegó a autenticarse**. No era la contraseña.
Render en plan gratuito cierra la salida SMTP, así que ninguna credencial de Gmail
funciona ahí. El puerto 443 sí sale.

### Dos caminos, elegidos con `EMAIL_PROVIDER`

| | |
|---|---|
| `smtp` **(por defecto)** | `smtplib` contra un servidor de correo. Necesita salida SMTP abierta |
| `brevo` / `sendgrid` | una llamada HTTPS a la API del proveedor |

**El SMTP no se reemplazó, se le sumó una alternativa.** Sin `EMAIL_PROVIDER` nada
cambia: una instalación existente no se entera. Si mañana el plan de Render permite
salida SMTP, se borra esa variable y las credenciales que ya estaban vuelven a
funcionar solas — hay una prueba que lo fija.

Se usa `urllib.request` y no `httpx` ni `requests` a propósito: `requirements.txt`
no trae ningún cliente HTTP, y una dependencia nueva es una forma de romper el
despliegue.

Los dos proveedores permiten verificar **una dirección suelta** como remitente
—`bmgpersonal99@gmail.com`, sin dominio propio—, que es lo que hacía falta acá.

### Configurar el envío

**Por HTTPS** (lo que funciona en el plan gratuito):
`EMAIL_PROVIDER=brevo`, `EMAIL_API_KEY`, `MAIL_FROM` y opcionalmente
`MAIL_FROM_NAME`. La dirección de `MAIL_FROM` tiene que estar verificada como
remitente en el proveedor.

**Por SMTP**: `SMTP_USER` y `SMTP_PASSWORD`, más `SMTP_HOST` (por defecto
`smtp.gmail.com`) y `SMTP_PORT` (por defecto `587`). Con Gmail, `SMTP_PASSWORD` no
es la contraseña de la cuenta sino una **contraseña de aplicación** de 16
caracteres, que exige verificación en dos pasos. Google la muestra en cuatro grupos
separados por espacios y quien la copia se los lleva puestos: **el módulo se los
saca**, porque el servidor la rechazaba con un error de credenciales que no
mencionaba los espacios.

**El puerto decide el modo**: 465 abre SSL desde el saludo y 587 hace STARTTLS.
Antes se hacía `starttls()` siempre, así que configurar 465 —una elección
habitual— fallaba con un error que no mencionaba el puerto.

**Los destinatarios** se cargan desde el ícono de ajustes del encabezado: gerente
operacional, y por sede el administrador y el mercaderista.

### El botón de prueba ahora sirve para probar

Respondía «No se pudo enviar el correo de prueba. Revise las credenciales SMTP y
los registros del servidor» pasara lo que pasara: una contraseña rechazada y un
puerto bloqueado por la red daban el mismo texto, y para distinguirlos había que
entrar a los logs del servidor. Un botón de prueba que no dice qué falló no prueba
nada.

Ahora devuelve el motivo real, más el servidor, el remitente, los destinatarios y
**cuántos segundos tardó** — que distingue una autenticación rechazada (vuelve en
menos de un segundo) de un puerto bloqueado (tarda hasta que corta el temporizador)
sin leer un solo log.

Un detalle de orden que costaría encontrar: **`smtplib.SMTPException` hereda de
`OSError`**, así que un `except OSError` puesto antes se traga también los errores
de autenticación y los reporta como problema de red.

---

## La mercaderista ya no entra con contraseña

El correo de montaje llevaba un enlace pelado y del otro lado había un login. La
mercaderista entraba con la **contraseña compartida del rol `worker`** y
aterrizaba en el tablero: el mapa de la sede entera, la tabla con el proveedor,
el período y el estado de cada espacio. Todo eso para responder una sola
pregunta — ¿lo montaste? —. Y una contraseña compartida repartida por correo
sobrevive a la persona que deja de trabajar ahí.

Ahora el correo lleva un **enlace firmado**: un JWT de rol `montaje`, acotado a
ESE espacio y con vencimiento a 30 días (`MONTAJE_TTL_DAYS`). Se toca y se está
adentro, sin contraseña, en una pantalla que sólo tiene ese espacio.

### La regla de la que cuelga todo: cerrado por defecto

`decode_token` **no reconoce el rol `montaje`**, así que `require_auth` lo
rechaza en toda la aplicación. Lo abre `require_montaje`, y sólo está puesto en
un router nuevo —`/api/montaje`— que es todo lo que ese token alcanza.

Es a propósito y al revés de lo que sale natural: dejarlo pasar por la puerta
general y filtrar endpoint por endpoint significa que el endpoint que alguien
agregue mañana nace abierto. Así nace cerrado.

`test_el_token_no_abre_ningun_otro_endpoint` recorre **las rutas de verdad** de
la app —26 hoy, con `/api/health` como única excepción escrita a mano— y exige
401 en todas. Si alguien agrega un endpoint, el barrido lo prueba solo; si
agrega uno con un parámetro que el test no sabe rellenar, falla pidiendo que se
lo enseñen, en vez de saltárselo en silencio.

### Tres endpoints, ni uno más

* `GET /montaje/mi-espacio` — todo lo que la pantalla muestra, en **una sola
  llamada**: su espacio con proveedor, marca y fechas; los vecinos como **pura
  geometría** para dibujar dónde queda; si hay planometría; y el último reporte.
  Una y no cuatro porque del otro lado hay un celular con señal de supermercado.
* `GET /montaje/planometria` — el archivo de "así debe quedar". Se sirve desde
  acá y no por `/planometrias/{id}` para no tener que abrir ese endpoint: allá
  el id viene del pedido y habría que confiar en una comprobación; acá el
  archivo se resuelve **desde el token** y no hay id que cambiar en la barra de
  direcciones.
* `POST /montaje/reportar` — el reporte. El código del espacio **no se toma del
  formulario**: sale del token. Un campo del formulario lo escribe el cliente, y
  con un enlace repartido por correo eso alcanza para escribir sobre el espacio
  de otro proveedor.

Los vecinos pasan por una **lista blanca** (`_GEOMETRIA`) y no por una negra: un
campo comercial que se agregue mañana al layout no se filtra por olvido.

### Una sola definición de qué es un reporte válido

Hay dos puertas al mismo acto —el tablero con sesión y el enlace firmado— y las
reglas (foto obligatoria si "montado", motivo obligatorio si "no pude", tipos de
imagen aceptados, el prefijo `montaje--` que evita secuestrar la textura del 3D)
viven en **una** función: `registrar_montaje` en `routers/mounts.py`. Duplicadas,
la copia que se olvide de exigir la foto es justo la que usa quien monta.

Lo mismo del lado del navegador: el formulario salió de `MountView.tsx` a
`components/Montaje/FormularioMontaje.tsx` y lo usan las dos pantallas. Lo que
cambia entre ellas entra por props — a dónde se manda el reporte, de dónde sale
la planometría, y si hay una lista a la que volver.

Y qué contrato manda hoy sobre un espacio es **una** regla
(`services/contratos.py`), compartida con la planometría por código: si cada uno
eligiera por su cuenta, el enlace mostraría "así debe quedar" de un contrato y
los datos de otro.

### Del lado del navegador

`App.tsx` lee `?t=` **una vez, al arrancar**, antes de cualquier sesión: con ese
token no hay tablero, no hay sincronización de layout y no hay login. El token
se queda en la URL a propósito —es la credencial del enlace, y ahí sobrevive a
una recarga—.

`api/montaje.ts` es un cliente axios **aparte** del de la sesión y guarda el
token **sólo en memoria**. Meterlo donde vive el de la sesión tendría dos
costos: al admin que abre el enlace en su propio computador para revisar algo lo
sacaría de su sesión, y dejaría la credencial de un enlace repartido por correo
en el `localStorage` del navegador. Verificado en el navegador: el admin abre el
enlace, ve la pantalla de montaje, vuelve a `/` y sigue siendo admin.

Un enlace inválido o vencido **no dice «iniciá sesión»** — dice que el enlace ya
no sirve y que pida que se lo reenvíen. Decirle a alguien que inicie sesión es
mandarlo a buscar una contraseña que ya no necesita tener.

### Lo que NO cambió

El rol `worker` sigue existiendo y la pestaña *Montajes* del tablero sigue ahí:
quien tenga la contraseña puede seguir entrando por ese camino. Lo que cambió es
que la mercaderista **ya no la necesita**. Cuando esto esté rodando, la
contraseña de worker se le puede dejar de dar.

Los correos ya enviados llevan enlaces sin `?t=`: siguen cayendo en el login y
funcionando como antes.

---

## Probarle el producto al mueble, delante del proveedor

El 3D mostraba lo que YA está contratado. Para cerrar un trato tiene que
mostrar lo que **podría** estar: el proveedor pregunta «¿y cómo se vería mi
producto acá?» y la respuesta tiene que salir en la pantalla, en esa reunión.

### Por qué el arte no podía seguir colgando del espacio

El arte entraba por los archivos del espacio en el plano 2D, y el 3D tomaba la
imagen **más reciente** de ese espacio (`list_face_images`). Tres consecuencias:

* No había botón en el 3D, que es justo donde se está negociando.
* El arte quedaba atada al espacio: el mismo producto había que **resubirlo en
  cada punta** que se quisiera mostrar.
* Cualquier imagen subida al espacio se convertía en el producto del mueble —un
  contrato escaneado en JPG, la foto de un pasillo—. Ya se había reservado el
  prefijo `montaje--` para que la foto de la mercaderista dejara de secuestrar
  la textura, y ese parche tapa **un** caso de los muchos posibles.

Ahora hay tabla propia (`supplier_assets`, sin migración: `create_all` sí crea
tablas nuevas) y el arte cuelga del **proveedor**. Se carga una vez y se le
prueba a cualquier mueble, de cualquier sede. El camino viejo sigue andando
para lo que ya está cargado.

### La prueba NO se guarda en el layout

Es la decisión de fondo y va contra lo que sale natural. El layout es lo que
está montado **de verdad**: si probar un producto lo escribiera ahí, la góndola
que Nutresa tiene alquilada aparecería con producto de Alpina en la pantalla de
todos, y el 3D dejaría de servir para saber qué hay puesto en la tienda.

La prueba vive en la sesión, indexada por `${fixtureId}|A` — por **id de mueble
y cara**, no por código de espacio: el código se compone en tres lugares con
reglas de prefijo y mayúsculas, y basta que una difiera para pintar el mueble
equivocado.

Prioridad de la cara: `producto en prueba → foto del espacio → patrón de
categoría → color plano`. La prueba va primero porque es una elección explícita
hecha en ese momento, delante del proveedor: tiene que ganarle a lo que haya
cargado de antes, que es justamente lo que se está proponiendo reemplazar.

### La lámina ya no le miente al proveedor

Es el arreglo más importante de todo esto. La lámina tomaba el proveedor, la
categoría, las fechas y el valor **del contrato vigente sobre ese espacio**.
Probándole un producto de Alpina a una punta alquilada por Nutresa, salía la
foto del yogur de Alpina y, debajo, «Proveedor: Nutresa» con las fechas y el
valor de Nutresa. El error más caro posible en el único papel que el proveedor
se lleva.

Ahora, cuando se está proponiendo, el pie habla de la propuesta: proveedor y
producto del arte que se está probando, y **sin período ni valor** — de lo
propuesto todavía no hay nada acordado, y poner las fechas del contrato de al
lado sería inventarlas. El rótulo de la segunda toma dice «Con Alpina» en vez
de «Con la marca», y el archivo sale `NAVE-PUN-01_Alpina_antes-despues.png`.

### Un bug viejo que salió al probar esto

**El panel comercial del 3D no se abría haciendo clic en un mueble.** El mueble
se selecciona en `pointerdown`, pero el `click` que viene después seguía bajando
hasta el piso —que está detrás y sí tiene `onClick`— y ahí `onFloorClick` hacía
`setSelectedId(null)`. Un clic seleccionaba y deseleccionaba en el mismo gesto.

Se notaba poco porque al panel se llega también desde **Vender**, que fija la
selección desde afuera. Se arregla cortando la propagación en el `onClick` del
mueble; mientras se está **colocando** uno no se corta, porque ahí el clic tiene
que llegar al piso, que es quien detecta que se está montando sobre otro.

### Cómo se comprobó

16 pruebas nuevas del catálogo (quién carga, quién mira, el SVG rechazado, el
arte que no se pisa con los archivos del espacio) y 3 del pie de la lámina.
Y manejando Chromium contra un backend real: cargar el arte, elegirla del
selector, ver la góndola surtida con el producto parado sobre cada entrepaño,
apagar las artes para el «antes», y exportar la lámina de una punta alquilada
por Nutresa comprobando que el papel dice **Alpina**.

Un detalle de las pruebas que casi manda a arreglar algo que no estaba roto: una
punta sembrada con 0.9 m de fondo (las reales tienen 0.4) hace que sus propios
entrepaños tapen el panel pintado y sólo se vea producto en el hueco de arriba.
Con medidas reales llena los cuatro.

---

## El producto estaba pintado al fondo del mueble

Al ver la primera góndola vestida en producción saltó lo que ninguna prueba
podía atrapar: el producto **quedaba perdido al fondo**. Se veía un estante
vacío con algo dibujado atrás.

No era el arte. La imagen se pintaba sobre el panel **trasero** de cada mueble
—la espina de la góndola, la placa de la punta, la pared de la nevera—. Es el
sitio cómodo: esos paneles ya existen y ya heredan la transformación del
mueble, que es justo lo que hundió los dos intentos anteriores de poner
geometría nueva (replicaban la matemática de ubicación y se despegaban).

Pero en una góndola de 0.9 m de fondo eso deja el producto **44 cm detrás del
filo del entrepaño**. En una tienda el producto está adelante: eso es lo que
significa un *facing*, y es literalmente lo que el proveedor viene a comprar.

### La lámina

Ahora la imagen va en una lámina propia (`LaminaDeProducto`), parada a 5 cm del
plano exterior del mueble — lo justo para que el riel de precio y el filo del
entrepaño queden por delante, como en un lineal de verdad.

No repite la matemática de ubicación: es **hija del mismo grupo** que el mueble,
así que sólo conoce coordenadas locales. Ese era el error de los intentos
viejos, no la idea de tener geometría propia.

Dos detalles que la hacen funcionar:

* **El fondo de la lámina es invisible**, no del color del panel. Con un
  material opaco sería una placa tapando el estante entero; con
  `opacity: 0, depthWrite: false` sólo se ve donde hay producto.
* **`y` y `alto` son los mismos que tenía el panel pintado.** La textura viene
  compuesta con las filas alineadas a los entrepaños reales en el espacio local
  de ese panel, así que moverla en Z no toca la alineación — moverla en Y sí la
  rompería.

Se aplicó a los cinco tipos que se pintan: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los paneles estructurales volvieron a
ser lisos, y con eso `getPlainLambert` y `getPlainStandard` quedaron sin uso
—existían sólo para ser el fondo de una caja pintada— y se borraron.

### Lo que queda sabido

El producto se estira hasta llenar el alto del entrepaño: una bolsa de café de
25 cm ocupa los 39 cm del hueco. Es la convención del compositor de planograma
y para vender se ve bien, pero no es fiel. Arreglarlo pide saber el alto real
del empaque, que hoy no se pide al cargar el arte.

---

## Un solo nombre para el mueble

El panel del plano decía **«—»** en Nomenclatura mientras el plano dibujaba
`GON-800` sobre el mismo mueble. No era un bug de dibujo: eran **dos campos
distintos**.

* El **código** (`GON-800`) lo genera el sistema, se dibuja dentro del mueble y
  es la llave: forma el código de espacio que viaja al contrato, al correo del
  mercaderista y a la lámina.
* La **nomenclatura** era texto libre, opcional y aparte. Vacía en los 109
  muebles del plano real. Sólo se dibujaba como una píldora encima del mueble, y
  sólo si tenía valor — así que prender «Etiquetas» sobre un plano recién hecho
  no mostraba **ni una etiqueta**.

Lo que decidió el arreglo: **el resto de la app ya los trataba como uno solo.**
El minimapa, la pantalla de montaje, el tablero y el 3D mostraban
`nomenclatura || código`. El plano 2D era el único que los separaba, y su panel
el único lugar donde se veía «—» cuando el nombre efectivo era `GON-800`.

### La regla

`nombreDeMueble(mueble)` en `utils/nomenclatura.ts`: el nombre es el código que
puso el sistema, y escribir una nomenclatura lo **reemplaza**. Una sola
respuesta a «¿cómo se llama este mueble?», y es la que se ve en el plano, en el
3D, en el montaje, en el tablero y en la lámina. Los seis lugares que resolvían
`nomenclatura || code` a mano ahora llaman a esta función.

El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es
cómo se lo nombra.

### La píldora sólo dice lo que la caja no dice

Al principio la píldora se dibujó siempre con el nombre efectivo. Resultado: el
nombre aparecía **dos veces** por mueble —adentro de la caja y en la píldora
encima— y las píldoras chocaban con el mueble de arriba. Peor que antes.

Ahora sale sólo cuando el nombre **no** es el del sistema (`nombrePropio`). Si
es el heredado, la caja ya lo dice. Y escribir en el campo exactamente el mismo
código tampoco cuenta como nombre propio: no es un nombre nuevo, es el mismo.

### Lo que ve el usuario

* Sin nombre escrito: el panel dice `GON-800 · del sistema` en vez de «—».
* Con nombre escrito: el panel dice `P1-A`, y `P1-A` aparece sobre el mueble.
* Vaciar el campo devuelve el nombre del sistema; el placeholder del input es el
  propio código, para que se vea qué se hereda.

---

## Tres pedidos del uso diario

### El período, en «Estado por espacio»

La tabla **ordenaba por fecha de fin** y calculaba los días restantes, pero no
mostraba ni el inicio ni el fin. Para renovar —o para reclamarle a un
proveedor— hace falta saber desde y hasta cuándo, no sólo cuántos días quedan.
Ahora hay dos columnas, `Desde` y `Hasta`, apagadas cuando la cara está libre
(son historia, igual que el «último: proveedor» de al lado).

De paso: los encabezados alineaban por índice (`i >= 4` → derecha). Agregar una
columna en el medio corría la alineación de todas las de atrás, y ya dejaba
«Montaje» con el título a la derecha y el contenido a la izquierda. Ahora cada
columna declara su alineación.

### Ocupado es rojo

Es la convención de cualquier mapa de disponibilidad: verde se puede vender,
rojo no. Estuvo un tiempo en violeta para no chocar con el rojo de «vencido»,
pero **el mapa de la sede nunca dejó de pintarlo rojo**
(`components/FloorMap/zones.ts`), así que el mismo estado tenía dos colores
según la pestaña. Ahora es rojo en los cuatro lugares: plano 2D, editor 3D,
mapa de la sede y el chip que lo filtra en el tablero.

También el «Tomado» del mapa de Vender, que es el mismo hecho con otra
etiqueta: ese mapa queda verde / ámbar / rojo, que se lee sin leyenda.

Vencido comparte el rojo y no compite: es un subconjunto de lo ocupado, la
tabla lo dice con todas las letras y el filtro «Vencidos» lo aísla.

### El mostrador de servicio al cliente

Faltaba en el catálogo. Es `servicio_cliente`, prefijo `SAC`, 1.60 × 0.70 ×
1.10 m, y nace **no comercializable** —como las cajas— porque es operación de
la tienda y no espacio que se le venda a un proveedor; la bandera se puede
cambiar a mano si alguna sede decide alquilar ese frente.

Es más alto que una caja (1.10 contra 0.90) porque se atiende de pie y de
frente, no de costado con una cinta, y lleva un tramo bajo accesible en un
tercio del frente. Eso último no es adorno: es lo que lo distingue de una caja
al mirar el plano.

El cartel se monta sobre parantes que salen del propio mostrador. Colgado del
techo quedaba flotando —en el 3D no se dibuja techo—, así que un cartel
suspendido se veía suelto en el aire.

---

## La tienda no se parecía a una tienda

Tres cosas que faltaban para que el 3D aguante una reunión con un proveedor.
Ninguna cambia lo que el sistema hace: cambian si le creés.

### Piso de baldosa

El piso era una lámina de un solo color. Al caminar no había contra qué medir
el paso, así que avanzar por la tienda se sentía como flotar: no se sabía si la
punta estaba a tres metros o a diez.

Ahora es una textura de baldosa de 60 cm con junta, dibujada en un canvas y
repetida **por metro real** —la baldosa mide lo mismo en una sede de 12 m que
en una de 40—. La imagen lleva dos baldosas por lado y no una: así las juntas
quedan por dentro del dibujo y no sobre el borde, que es donde el filtrado
bilineal deja costura al repetir; las líneas de los bordes van a media caña y
al repetirse se suman en una junta completa.

Lleva **anisotropía al máximo del equipo**. Sin eso, mirando el piso casi de
canto —que es todo el rato en primera persona— la retícula lejana se deshace
en moaré.

### Muros, y sólo al caminar

Al caminar ya te frenaba `murosDeCaminata` en el perímetro, pero ese tope era
**invisible**: chocabas contra nada y te detenías. Eso no se lee como «llegué a
la pared», se lee como que el programa se trabó. El muro no agrega realismo:
hace honesto un límite que ya existía.

Van a 4,5 m —la altura de un supermercado de verdad—, con zócalo, y **sólo en
primera persona**: en la vista orbital, que es la que se usa para negociar,
taparían el plano.

Un detalle que sólo se vio mirando: quedaron **marrón sucio, más oscuros que el
piso**, al revés de cualquier tienda. La direccional principal cuelga a 40 m
casi a plomo, así que una cara vertical recibe N·L ≈ 0 y el muro se quedaba
sólo con el ambiente. Se levanta con `emissive` en el material del muro y no
tocando la luz de la escena, que ya está calibrada para los muebles. Medido
sobre la captura: muro (204, 200, 190) contra piso (205, 202, 195) — parejos,
que es como se ven de verdad.

**Techo no**, y es una decisión, no un olvido: taparía la única direccional
fuerte y habría que rehacer la iluminación entera; escondería el plano en la
vista orbital, obligando a mantener dos montajes de luz; y a 1,65 m de ojo con
fov 50° casi no entra en cuadro.

### Una persona de 1,70 m

Es lo que vuelve legible la escala. Un render sin nada humano al lado se ve
como una maqueta: el proveedor no sabe si su exhibidor le llega al pecho o a la
rodilla, y «1,80 m de alto» escrito en una ficha no se lee igual que verlo.

Aparece al lado del **mueble elegido**, no siempre. Va al COSTADO y no adelante
a propósito: adelante taparía justo la cara que se está vendiendo. Y no es
chrome — sale en la captura para el proveedor, que es donde hace falta.

`lugarDeLaFigura` vive en `utils/planta.ts` y está probada, porque el caso que
importa no es el de la sede de demostración. Prueba derecha, después izquierda,
y si en ninguna hay lugar **devuelve `null` en vez de plantarla igual**: con
doce góndolas sueltas cualquier lado sirve, pero en una sede de ciento
veintiséis un costado da al pasillo y el otro a la góndola de al lado, y una
persona metida adentro de un estante no aclara la escala — la arruina. El test
es el mismo con el que se camina (`chocaEn` sobre `murosDeCaminata`, que ya
infla cada huella por `RADIO_PERSONA` y respeta la rotación), así que la figura
se para exactamente donde podría pararse alguien.

### Lo que queda sabido

El remate del muro se ve desde lejos: sin techo, a más de unos metros el ojo
pasa por encima de los 4,5 m y aparece el fondo del lienzo. Es una transición
suave y no se lee como agujero, pero está. Subir el muro no lo resuelve —a 12 m
de distancia el cuadro llega a 7 m de alto—; lo resuelve un techo, y el techo
cuesta la iluminación.

---

## El conflicto no se podía resolver

El panel que ofrece «Usar la del servidor» / «Conservar la mía» se dibujaba
`position: absolute` dentro del `<header>`, y ese header lleva `overflow:
hidden` —está ahí para que la fila de pestañas no lo desborde en pantallas
angostas—. Resultado: del panel se veía **la tirita de arriba** y los dos
botones quedaban recortados fuera de la caja.

O sea que una sede en conflicto **no se podía resolver desde la interfaz**.
El indicador decía «Conflicto» para siempre, cada guardado seguía dando 409
(`pushSede` no reintenta una sede en conflicto sin `force`) y la única salida
era la consola del navegador. Le pasó a alguien con la única copia buena de
una sede encima.

Ahora el panel va por **portal a `document.body`**, `position: fixed`, anclado
al botón con `getBoundingClientRect` y reubicado en `resize` y `scroll`. Así
ningún contenedor lo puede recortar, sea cual sea el `overflow` de la cadena
de padres.

### Y dice los números

Elegir entre «la mía» y «la del servidor» a ciegas es lo que da miedo, y el
miedo es lo que deja una sede en conflicto durante días. El panel ahora
muestra **cuántos muebles hay de cada lado** —los locales salen del store, los
del servidor de `GET /layout/revisions`, que ya devolvía `count`— y una línea
que dice lo que el usuario necesita saber para animarse: *«Conservar la mía»
sube lo de esta computadora y pisa lo del servidor. No borra nada de acá.*

Es cierto y es la asimetría que importa: `resolveConflict(sede, "mine")` hace
un `pushSede` con `base_updated_at: null` y **no lee nada del servidor**;
`"server"` es el que descarta el trabajo local. `PUT /layout/{sede}` sólo
reemplaza el JSON de muebles de esa sede: espacios, contratos y montajes viven
en otras tablas y no los toca ninguna de las dos ramas.

---

## Los muebles se dibujaron a ciegas

El catálogo 3D se escribió a partir de la descripción de cada mueble, sin una
sola foto ni una referencia de otro programa. Eso dejó dos problemas de
distinta naturaleza, y el segundo es el que importaba.

### Ocho de los trece no se podían vestir

Probarle el producto del proveedor al mueble —la función por la que se cierra
un trato— **sólo funcionaba en cinco tipos**: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los otros ocho quedaban afuera, y no
por un olvido: el compositor sabía hacer una sola cosa, apilar filas de
facings sobre entrepaños. Una batea no tiene ninguna cara vertical que pintar.

Ahora hay **tres formas** de llevar producto, y cada tipo declara la suya en
`getPanelShelfSpan`:

| forma | qué es | quiénes |
|---|---|---|
| `estante` | filas de facings sobre entrepaños | góndola, punta, robatope, vitrina, nevera de refrescos, cruz, impulsador |
| `volcado` | producto a granel visto **desde arriba** | isla de piso, batea, isla fría, nevera de carnes, stand de frutas |
| `tira` | una columna de unidades colgadas | ristra |

`volcado` es la que faltaba, y es justo la mitad promocional del catálogo. Se
compone en el mismo canvas que las otras dos, tejiendo unidades de 13 cm con
las filas desfasadas y una rotación por celda —determinística, derivada de
`(fila, columna)`— para que se lea como un montón y no como una grilla.

### Ningún mueble inventa producto

La regla vieja era que cada malla traía su propio relleno: cajas de helado de
colores en la isla fría, un bloque verde en el stand de frutas, una losa roja
en la nevera de carnes, botellas rojas / naranjas / verdes / azules en la de
refrescos. Con el arte del proveedor cargado, **ese relleno se veía por los
huecos entre facings** y competía con la marca que acababa de pagar por estar
ahí.

Ahora el producto inventado se borró de todos, con una sola excepción
deliberada: la nevera de refrescos conserva botellas **mudas, de un solo tono
frío**, y sólo mientras el espacio esté sin vender. Una nevera vacía no se lee
como nevera; una nevera con seis colores de marcas que no existen le roba el
protagonismo a la que sí.

### Mueble por mueble

- **Isla fría.** Era un cajón macizo con un vidrio azulado adentro fingiendo
  el pozo, así que el producto quedaba enterrado en geometría y no se veía.
  Ahora el hueco es geometría de verdad: cuatro paredes de 5,5 cm sobre un
  cuerpo más bajo, y el producto apoyado en el piso del pozo.
- **Stand de frutas.** Dieciocho tablas apiladas hasta un metro: una ruma de
  madera. Un stand de verdad es un mesón con un cajón **poco profundo** arriba,
  para que la fruta quede a la vista y al alcance de la mano. El producto va
  adentro del cajón, no al ras del borde —al ras se veía como una tapa impresa—.
- **Exhibidor cruz.** Dos paneles del fondo entero, en gris casi negro, que
  enmarcaban el producto como dos paredes. Ahora se para en cuatro postes de
  esquina con travesaños, en metal claro, y lleva fondo: sin fondo, detrás del
  producto quedaba un hueco negro.
- **Góndola.** Se paraba en dos patitas, con el pasillo visible por debajo, y
  llevaba una barra blanca suspendida por encima sin apoyarse en nada. Ahora
  tiene zócalo corrido de punta a punta y un remate al ras sobre los montantes.
- **Batea.** El volcado flotaba en el aire, en el medio de la jaula. Se le
  agregó el **fondo falso** que toda batea tiene, que es lo que sube el producto
  cerca del borde. De paso, el riel de arriba cerraba 4,5 cm por encima del
  montante: era un aro suelto.
- **Vitrina.** En gris pizarra se leía como un electrodoméstico negro y le
  robaba el contraste al producto. Acero claro, y la tira LED del techo —que era
  una losa del fondo entero tapando el estante de arriba— quedó donde va, pegada
  al frente.
- **Isla de piso.** Tres bandejas de 10 cm flotando una sobre otra. Ahora es
  cartón escalonado macizo, cada andén una caja de altura completa, con el
  producto volcado sobre cada uno.
- **Ristra.** Se leía como un panel. Ahora es lo que dice el nombre: una
  columna de unidades colgadas.
- **Nevera de carnes** e **isla fría**: el volcado se había puesto *debajo* de
  una superficie interior que ya existía, así que no aparecía nada. Va sobre el
  cuerpo, bajo el vidrio.
- **Robatope.** El indicador de estado se montaba al 90 % de la altura, encima
  del producto. El estado es del sistema y no tiene por qué taparle la cara al
  proveedor: va abajo, como en todos los demás.

### Cómo se comprobó

Sembrando **los catorce del catálogo** (los trece que se venden más el mural)
en una escena y mirándola dos veces: una con el mismo arte cargado en todos
—para ver que ninguno queda sin vestir—, y otra con los espacios vacíos, que es
el estado en el que están casi siempre. Las dos capturas están en la conversación.

### Lo que sigue debiendo

El producto **se estira para llenar el hueco entre entrepaños**: el compositor
sabe cuántas filas caben pero no cuánto mide el empaque, así que una chocolatina
en una góndola de 38 cm de paso se dibuja de 38 cm de alto. Arreglarlo pide un
campo «alto del empaque» en el arte, no un cambio en las mallas.

---

## Pendiente urgente: datos de TERRON

TERRON tenía datos reales y **quedó vacía en el servidor**, vaciada por el bug del layout
vacío antes de que se desplegara el arreglo.

Procedimiento de recuperación, en orden:

1. **No abrir la app** en ningún equipo que pueda conservar la copia: al arrancar adopta la
   del servidor y sobrescribe la local.
2. En cada equipo, entrar a `https://retail-espacios.onrender.com/api/health` — esa URL
   devuelve JSON y **no carga la aplicación**, así que no dispara sincronización. Abrir la
   consola (F12) y correr:

   ```js
   const s = JSON.parse(localStorage['retail-fixtures-v1']).state;
   Object.fromEntries(Object.entries(s.fixturesBySede).map(([k, v]) => [k, v.length]))
   ```

3. Si TERRON aparece con fixtures, copiar la copia completa con
   `copy(localStorage['retail-fixtures-v1'])` y reconstruir la sede desde ahí.
4. Si ningún navegador la conserva, la vía es un **backup de la base** en Render. El botón
   *Rollback* del servicio web **no sirve**: revierte el código, no los datos.

---

## Backlog

1. **Estado de renovación** (en negociación / renovado / no renueva). Lo que lo vuelve
   accionable no es el estado sino el **valor propuesto** al lado del vigente: el tablero
   deja de decir "8 contratos por vencer" y pasa a decir cuánta plata está en juego.
2. **Histórico por espacio**. Es además prerrequisito de la tarifa de referencia: no hay
   tarifario público de exhibición en Colombia (los acuerdos son confidenciales), así que
   la única referencia calibrable es "a cuánto se cerró este mueble en esta sede antes".

Hecho en agosto 2026: tarifa de referencia por tipo y sede, disponibilidad por fechas,
calendario por temporada sobre el mapa, correos por rol y confirmación de montaje desde
el celular — ver "Qué está hecho".

No perseguir: pantallas digitales, sensores de impresiones, compra programática,
reconocimiento de imagen para auditar anaquel, y scorings de "tienda perfecta". Los tres
primeros porque el in-store retail media no llega al 1 % del gasto de retail media ni
siquiera para las cadenas grandes; el cuarto porque a tres tiendas gana un humano mirando;
el quinto porque mide la salud de la marca del proveedor, que no es trabajo del retailer.

### Sobre las cifras que solían estar acá

Este documento afirmaba que las puntas de góndola ocupan menos del 5 % del piso y mueven
el 30 % de las ventas de la categoría, con aumentos de 150–400 %. Se verificaron una por
una y **ninguna se sostiene**: el "30 %" se rastrea hasta un artículo de opinión que cita
un libro comercial sin metodología, el "5 % del piso" no aparece en ninguna fuente, y el
rango "150–400 %" sale de un blog de software que lo atribuye a *"industry data"*.

Lo que sí está medido (Nakamura et al., *Social Science & Medicine* 108, 2014, acceso
abierto): aislando la ubicación del descuento, el efecto de una punta va de **+23 % a
+114 %** según la categoría — y entre la mitad y dos tercios de la diferencia bruta que se
ve no es la ubicación sino el descuento y los facings extra que la acompañan. El gobierno
británico, con miles de millones de libras en juego, usó **55 %**.

Nada de esto cambia el backlog, que se justifica solo con inventario escaso y contratado.
Pero sirve en una negociación: si un proveedor llega con que la punta le multiplica las
ventas por cuatro, el número honesto es otro.

---

## La identidad, elegida en vez de heredada

Toda la paleta salía de los valores por defecto de Tailwind: `#7C3AED` era
`violet-500` sin tocar, los semánticos eran `green-700`, `amber-700` y
`red-700`, y el fondo `#F8F6F1` es el crema de la mitad de lo generado por IA.
La tipografía era **Geist**, que junto con Inter es la fuente por defecto de
los productos de IA de estos años. No estaba mal combinado: **no estaba
elegido**, y por eso se leía como plantilla.

Nada de lo nuevo salió de mi criterio. Cada valor tiene procedencia:

| Qué | De dónde |
|---|---|
| Tipografía **IBM Plex Sans / Mono** | `ui-ux-pro-max`, primer resultado de `--domain typography` para «professional data dense financial»: *financial, trustworthy, banking, enterprise* |
| Acento **`#00004D`** | Tema «Morgen Capital» de 21st.dev (`get_theme`, gratis) |
| Neutros fríos, acromáticos | Tema «PayMongo» de 21st.dev — su modo claro lleva croma 0 en todos los grises |
| Pastilla de estado con **fondo tintado + borde** | Componente «Leads Data Table» de 21st.dev (`get_component`) |

### Lo que enseñó el componente real

Mis propuestas anteriores eran **planas y tipográficas**; un tablero comercial
que se ve caro es **estratificado**. La diferencia concreta, sacada de leer el
código de un componente publicado:

- Cada estado lleva **terna**: tinta, fondo tintado y borde. No fondo solo.
- El borde es lo que le da canto a la pastilla y evita que se disuelva en la fila.

Eso destapó un defecto de información que llevaba tiempo ahí: `STATUS_META`
declaraba un campo `fill` que **no consumía nadie**, así que las ocho pastillas
de estado salían del mismo violeta y lo único que las distinguía era un punto
de 6 px. Un «Vencido» y un «Activo» se veían iguales de reojo — que es
exactamente como se mira una tabla de 126 filas.

### Detalles

- `tnum` y `font-variant-numeric: tabular-nums` van en el `body`, no sueltos:
  la mitad de lo que se lee acá son códigos, fechas y plata en columna, y con
  cifras proporcionales las columnas bailan al cambiar de valor.
- Las sombras pasaron de `rgba(31,27,18,…)` —marrón— a `rgba(11,18,32,…)`.
  Una sombra cálida bajo una superficie fría se ve sucia.
- El cajón oscuro también se enfrió, para que no convivan un gris cálido y uno
  frío en la misma pantalla.
- **La paleta del 3D no se tocó.** Los grises del acero, la madera del cajón y
  el piso de baldosa son mundo físico, no cromo: tienen que seguir
  pareciéndose a una tienda.
- **El semáforo conserva su significado.** Verde se puede vender, ámbar
  comprometido, rojo ocupado. Se recalibraron los valores para el papel frío;
  la convención no se movió.

---

## El sistema se llama RECABRA

Se llamaba **Galerías**, que es el nombre del cliente. Un sistema no puede
llevar el nombre de uno de sus clientes: el día que entre la segunda cadena,
el producto queda con la marca del competidor en la barra.

El nombre nuevo es **RECABRA**. Lo puso el dueño del producto. Queda dicho de
una vez lo único que hay que saber: la sílaba tónica es re-**CA**-bra, y
alguien va a hacer el chiste.

También se descartó **SIRESA** (*Sistema Retail Espacios Adicionales*), que era
la primera idea. La razón no fue de gusto: [Siesa](https://www.siesa.com/) es el
ERP líder de Colombia — 45 años, más de 10.000 clientes en Colombia, Perú,
Ecuador y México — y una cadena de supermercados colombiana probablemente ya lo
tiene instalado. Una letra de diferencia, mismo país, mismo comprador.

### Dónde estaba el nombre

Fue superficial, y conviene que siga así:

| Archivo | Qué |
|---|---|
| `frontend/index.html` | `<title>` — la pestaña |
| `frontend/src/pages/Dashboard.tsx` | la marca en la barra |
| `frontend/src/pages/Login.tsx` | la marca en el ingreso |
| `frontend/src/utils/planilla.ts` | nombre del Excel exportado |
| `backend/app/main.py` | título de la API y `/api/health` |
| `backend/app/services/mailer.py` | `MAIL_FROM_NAME` y el pie de los correos |
| `backend/app/routers/bulk_leases.py`, `notifications.py` | texto de los correos |

De paso salieron dos `#7C3AED` **hardcodeados** en plantillas de correo
(`bulk_leases.py`, `spaces.py`): el violeta viejo, que ya no existía en ningún
token. Quedaron en el acento nuevo. Los correos no pasan por Tailwind, así que
un cambio de paleta no los alcanza — cada vez que se toque la identidad hay que
revisarlos a mano.

### Lo que NO se tocó, a propósito

`backend/app/auth.py` tenía `"worker_password": "galerias"` como valor por
defecto, y `routers/auth.py` lo leía con `get_config(db, "worker_password",
"galerias")`. **Era la contraseña viva de los mercaderistas** si nadie la
cambió desde configuración, así que en el cambio de identidad no se tocó:
borrar ese default dejaba a la gente afuera de un día para otro.

*Actualización (fase 2 de seguridad, más abajo).* El default salió del código
—era la misma clave para todos los supermercados que instalen esto— pero la
contraseña **viva no cambió**: la que esté en la base sigue funcionando y se
convierte sola a Argon2 en el primer ingreso. Se cambia desde la pantalla de
configuración, no desde el código, y conviene hacerlo avisando.

---

## La línea visual: Empresarial

De seis líneas armadas en el prototipo, la elegida fue **Empresarial**.

| Token | Antes | Ahora |
|---|---|---|
| `--font-sans` | IBM Plex Sans | **Plus Jakarta Sans** |
| `--font-mono` | IBM Plex Mono | IBM Plex Mono *(sin cambio)* |
| `--accent` | `#00004D` navy | **`#0369A1`** azul de oficina |
| `--bg` | `#F2F4F7` | `#F8FAFC` |
| `--ink-1` | `#0B1220` | `#020617` |
| `--success` / `--warning` / `--danger` | `#0F7B4F` / `#9A6B0E` / `#C0392E` | `#15803D` / `#B45309` / `#DC2626` |
| Sombras | `rgba(11,18,32,…)` | `rgba(2,6,23,…)` |

**Una diferencia deliberada con el prototipo.** La línea Empresarial usaba
*una sola familia* — Plus Jakarta Sans también para el mono. Acá se mantuvo
IBM Plex Mono, porque `var(--font-mono)` está aplicado a los chips de código
(`ALF-GON-21`), a los ids de zona y a los inputs de tarifa, y ahí una retícula
fija sí paga. Además desde este contenedor no se puede verificar si Plus
Jakarta trae cifras tabulares, y si no las trae las columnas bailan — que es
justo lo que el `tnum` del `body` está ahí para evitar. Si se quiere una sola
familia, es cambiar un token.

**La marca en caps quiere tracking positivo.** `RECABRA` iba a heredar el
`letter-spacing: -0.015em` del nombre anterior, que está calculado para
minúsculas. En versales apretadas se lee como un error de impresión. Quedó en
`+0.055em` con peso 800.

---

## Herramientas de diseño en el repo

`.claude/skills/` trae **ui-ux-pro-max** (MIT, `nextlevelbuilder/ui-ux-pro-max-skill`),
instalada con `npx ui-ux-pro-max-cli` → `uipro init --ai claude`. Son siete
skills —`ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`, `slides`,
`banner-design`, `design`— con un catálogo local que se consulta con Python 3
de la librería estándar: **79 estilos, 192 paletas de producto, 74 pares
tipográficos, 119 guías de UX, 105 iconos, 25 tipos de gráfico y 22 stacks**.

```bash
# Dirección visual completa para un producto
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<producto> <rubro> <claves>" --design-system -p "Galerías"
# Un solo tema
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant serif" --domain typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "glassmorphism"  --domain style
```

Los scripts **no instalan nada y no hacen llamadas de red**: leen los CSV de
`data/`. Para actualizar, `uipro update`.

Está commiteada a propósito y no en `.gitignore`: el contenedor de una sesión
remota es efímero, así que si no vive en el repo hay que reinstalarla cada vez.

**Por qué está acá.** La paleta del sistema salía entera de los valores por
defecto de Tailwind —`#7C3AED` es `violet-500` sin tocar, los semánticos son
`green-700`, `amber-700` y `red-700`, el fondo es el crema de la mitad de lo
generado por IA—, y ese es el motivo de que se lea como plantilla. El catálogo
existe para que la dirección visual se elija de una lista razonada en vez de
inventarse. **La decisión de qué dirección tomar sigue sin estar tomada.**

---

## Seguridad: lo que dejó el vibecoding

La auditoría salió de una pregunta concreta —esto se le va a vender a varios
supermercados, con contratos y planos adentro— y de lo que se lee afuera sobre
código generado con IA: la [Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
mide 62% de aplicaciones con al menos una vulnerabilidad seria, y
[Georgia Tech](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn)
encontró 86% de fallas de XSS en lo generado. Doce hallazgos, ordenados por lo
que costaría que pasen.

### Fase 1 — lo que no necesitaba que nadie decidiera

* **El IDOR de los archivos** (`routers/files.py`). Un `worker` autenticado
  podía listar y bajar **cualquier** adjunto por id: los contratos con las
  cifras del negocio incluidos. Ahora `list_space_files` **filtra** en vez de
  rechazar —así el panel del mercaderista sigue funcionando— y `download_file`
  contesta **404, no 403**: un 403 confirma que el archivo existe.
* **CVE-2024-53981** en `python-multipart` 0.0.9 → 0.0.20. Al parsear un
  multipart recorría byte a byte lo que viniera antes del primer delimitador y
  registraba cada uno; con `--workers 1` una sola petición tumba el servicio.
* **La cadena del `xlsx`** y las cabeceras de seguridad (CSP, `nosniff`,
  `frame-ancestors`, HSTS sólo bajo TLS) en `main.py`.

### Fase 2 — las contraseñas

Cuatro cosas, y las cuatro se probaron fallando contra el código anterior antes
de escribir el arreglo (`backend/tests/test_claves.py`, 19 pruebas).

**Estaban en texto plano.** `app_config` guardaba `admin_password` y
`worker_password` tal cual, y se comparaban con `==` —que además tarda distinto
según cuántos caracteres coincidan—. Un respaldo de la base las entregaba todas.
Ahora se guarda el hash **Argon2id** bajo una clave nueva.

> Se puede hacer **sin migración** porque `app_config` es clave/valor: una clave
> nueva es una fila nueva. `create_all` crea tablas que faltan pero nunca agrega
> columnas — la regla que sigue bloqueando el `tenant_id` de la fase 3.

**Migra sola.** En producción esas contraseñas están en claro desde hace meses.
Si el arreglo pidiera un paso manual, alguien se queda sin entrar el lunes:
`verificar_clave` acepta el texto heredado, escribe el hash y borra la fila en
claro **en el mismo movimiento**. Nadie hace nada, nadie queda afuera.

*Ahí aparecieron dos bugs que habrían tumbado el despliegue entero,* y los dos
son el mismo error de forma: una excepción que no era la que parecía.

1. `secrets.compare_digest` con cadenas **exige ASCII** y lanza `TypeError` con
   una tilde o una eñe. Una contraseña colombiana perfectamente normal
   —`señora-galerías`— no daba "clave incorrecta" sino un 500. Se compara en
   bytes.
2. `InvalidHashError` de Argon2 **no hereda de `Argon2Error`** sino de
   `ValueError`, así que el `except` obvio no lo atrapa. Un hash ilegible en la
   base —un respaldo a medias, alguien editando `app_config` a mano— convertía
   el login en un 500 para todo el mundo. Ahora es un 401 del rol afectado, con
   una línea de error en el log, y el otro rol sigue entrando.

**Las claves por defecto salieron del código.** `admin123` y `galerias` estaban
publicadas en el repositorio y eran las mismas para cada supermercado que
instalara esto. Una instalación nueva las toma de `ADMIN_PASSWORD` /
`WORKER_PASSWORD`, y si no están genera una al azar y la escribe en el log del
arranque. **La base manda:** si el rol ya tiene contraseña no se pisa aunque la
variable de entorno diga otra cosa, o cada reinicio revertiría lo que se cambió
desde la pantalla de configuración.

**El freno de intentos vivía en memoria** (`defaultdict` de `deque`). Se borraba
en cada despliegue, y Render reinicia el servicio gratuito cuando se queda
quieto: bastaba con esperar para tener los diez intentos otra vez. Ahora es una
tabla, `login_attempts`, y anota **sólo los fallos** —contar los aciertos
castigaba a quien entra y sale varias veces en la mañana, que es lo que hace un
administrador—. Un ingreso correcto borra la cuenta de esa IP.

**Y la IP tenía que ser la de verdad.** Detrás del proxy de Render todas las
peticiones llegan desde la misma dirección interna: el freno era decorativo. La
lista de `X-Forwarded-For` se lee **de derecha a izquierda** buscando la primera
pública, porque el principio de esa cabecera lo escribe el cliente y el final lo
escribe el proxy — leyéndola al derecho, cambiar la primera IP en cada intento
daba intentos infinitos. Si la conexión llega directa (el peer ya es público, no
hay proxy adelante) la cabecera se ignora entera.

**Cambiar la contraseña ahora echa a la gente.** Antes no: los JWT ya emitidos
valían hasta doce horas más, justo lo contrario de para qué se cambia una
contraseña. Cada rol lleva un contador de época en `app_config` y el token
guarda con cuál nació. Es **por rol** a propósito, y con una consecuencia de
pantalla: cuando el admin cambia su propia clave se cierra también su sesión, así
que la respuesta trae un token nuevo para no expulsarlo de la pantalla en la que
acaba de guardar.

**Los parámetros de Argon2 son los mínimos de OWASP** (19 MiB, dos pasadas, un
hilo), no los de la librería (64 MiB, cuatro hilos). El servicio corre en una
instancia de 512 MB: con los de fábrica, un puñado de intentos simultáneos
—exactamente lo que hace un ataque de fuerza bruta— se come la memoria de la
máquina. Defenderse de que adivinen la contraseña no puede costar el servidor.

### Fase 3 — lo que sí se podía hacer sin decidir nada

De la fase 3 quedaban dos hallazgos que no dependen de la decisión grande. Los
dos están hechos.

**El enlace de montaje salió de la barra de direcciones.** Viajaba como
`?t=<jwt>` y se quedaba ahí a propósito, para sobrevivir a una recarga; el costo
era que la credencial quedaba en el historial del navegador y en cualquier
captura de pantalla de la mercaderista. Ahora pasa a `sessionStorage` —que muere
al cerrar la pestaña, a diferencia del `localStorage` donde vive la sesión del
tablero— y la URL queda en `?montaje=1`.

Esa marca no es cosmética: sin ella, recargar y escribir la dirección pelada
serían indistinguibles, y el admin que abre el enlace en su computador quedaría
encerrado en la pantalla de montaje. Probado en navegador, con contrato real y
viewport de celular: llega, recarga, y `/` a secas vuelve al login.

*Lo que NO se tocó:* los 30 días de vigencia. Es una decisión de operación —el
correo sale al firmar y la exhibición se arma en los días siguientes—, no un
descuido. Y el `Referrer-Policy` de la fase 1 ya evita que el token se filtre por
la cabecera `referer`.

**La bitácora.** No había ninguna: si faltaba un contrato o cambiaba un valor,
no había forma de saber quién ni cuándo. Tabla nueva `audit_log` —otra vez, sin
migración—, con lectura sólo para el administrador en Configuración.

Se anota **lo que cambia algo o abre una puerta**: contratos creados y
cancelados, documentos subidos, bajados y borrados, sedes eliminadas, cambios de
contraseña, ingresos y ingresos fallidos. Los listados y las consultas no —si
cada pantalla dejara línea, lo que importa se pierde en el ruido—, y de los
archivos sólo se anota la bajada de **documentos**: la foto del montaje se abre
decenas de veces por día.

Tres decisiones que valen más de lo que parecen:

* **`anotar` no hace commit.** Viaja en la transacción del endpoint, así que la
  línea y el cambio caen juntos o no cae ninguno. Una bitácora que dice que se
  canceló un contrato que sigue vivo manda a buscar donde no hay nada.
* **Nunca entra un secreto.** Ni la contraseña que se intentó —media bitácora
  serían claves casi correctas de gente que se equivocó una letra—, ni el valor
  del contrato, ni el contenido del archivo. La bitácora la lee más gente que la
  base.
* **El título se arma al leer,** desde un código estable (`contrato.alta`). Si se
  guardara la frase, cambiar la redacción reescribiría el pasado.

Se purga a los 365 días, en el ciclo de mantenimiento que ya corría cada 12
horas: en una base de plan gratuito no puede crecer sin techo, y guardar de más
es su propio riesgo.

*Un bug encontrado al probarlo en pantalla:* SQLite guarda la fecha **sin huso**,
y el navegador lee eso como hora local. En Colombia son cinco horas: la bitácora
decía "recién" para algo de la madrugada. La hora sale marcada como UTC desde el
endpoint, que es donde se sabe qué es lo guardado.

### Lo que sigue pendiente, y por qué

* **Aislamiento entre supermercados (fase 3).** Es el hallazgo crítico que
  queda. `tenant_id` en las tablas que ya existen **necesita migraciones**, y la
  regla de este repo es que no hay. Hay que elegir: adoptar Alembic (base
  compartida con RLS) o una base por cliente. Es una decisión de producto, no
  técnica.
* **Cuentas de usuario.** La tabla `users` sí se puede crear sin migración, pero
  pasar de dos contraseñas compartidas a cuentas nominales es un cambio
  operativo para siete tiendas vivas: se coordina, no se despliega de sorpresa.
* **Pagos (fase 4).** Falta elegir proveedor —Stripe o MercadoPago para
  Colombia— y las llaves, que no viajan por chat: van en el panel de Render.
* **Dos avisos `moderate` de `react-router`** (open redirect). El arreglo es un
  salto de versión mayor; se dejó afuera a propósito de la fase 1.

Con eso, de los doce hallazgos quedan **dos**, y los dos son los que necesitan
una decisión: el aislamiento entre supermercados y las cuentas nominales. El
resto —el DoS, el IDOR, las contraseñas, las claves por defecto, el freno de
intentos, la revocación de sesiones, las cabeceras, el enlace en la URL y la
bitácora— está cerrado.

### Lo que hay que hacer a mano después de desplegar

**Cambiar la contraseña de administrador desde la pantalla de configuración.**
`admin123` está en el historial de git. La migración la mantiene funcionando
—por eso nadie queda afuera— pero mantenerla es dejar la puerta abierta.

---

## Un supermercado, una base

De los doce hallazgos de la auditoría quedaba el crítico: `sede` era un texto en
una tabla común, así que dos supermercados en esta base compartían tabla,
contraseña y archivos. Se eligió **una base de datos por cliente, todas dentro
de la misma instancia de Postgres.**

### Por qué ésa y no las otras dos

Se compararon tres. La [documentación de Render](https://render.com/docs/postgresql-creating-connecting)
dice que una instancia puede contener varias bases —`CREATE DATABASE`, y te
conectás con la misma URL cambiando el último componente—, y eso es lo que
rompió el empate:

| | Todo mezclado con `tenant_id` | **Una base por cliente** | Una instancia por cliente |
|---|---|---|---|
| Plata (5 clientes) | $44/mes | **$44/mes** | $120/mes |
| Trabajo | 2–3 semanas | **4–6 días** | 3–4 días + operación |
| Migraciones | Obligatorias (Alembic) | **Ninguna** | Ninguna |
| Aísla | Por política | **Por construcción** | Total |

**La razón que decidió es la tercera fila.** La regla de este repositorio es que
`create_all` crea tablas que faltan pero nunca agrega columnas. Meter
`tenant_id` en diez tablas con siete tiendas de datos vivos adentro pedía
adoptar Alembic; armar una base nueva y vacía no pide nada.

Y una cuarta, que no estaba en el análisis original: **esta opción deja abierta
la puerta a la de al lado.** Si mañana un cliente exige su propia instancia,
mudarlo es un `pg_dump` de su base. Sacarlo de una tabla compartida sería
extraer sus filas de diez tablas sin romper las llaves foráneas, con el sistema
andando.

### Lo que lo hizo barato

**Todos los routers pasan por `get_db`.** Ese es el único lugar donde se decide
contra qué base corre una consulta, así que separar clientes no obligó a tocar
los doce routers: se cambió el punto de entrada y de ahí en adelante nadie más
elige. Sólo tres lugares abrían sesión por fuera —el arranque, el ciclo de
mantenimiento y un ayudante de correo que resultó ser código muerto.

### El cliente va adentro del token

Sin esto la separación por base no serviría de nada. La firma de los JWT es
**una sola para todo el servicio**, así que un token de administrador de un
supermercado sería criptográficamente válido en el otro. Va adentro de lo
firmado (`create_token(role, epoca, cliente)`), y `cliente_del_pedido` verifica
la firma **antes** de mirar el nombre.

Un token sin cliente —los que ya estaban dando vueltas cuando se desplegó esto—
se resuelve con el único cliente que haya. Así nadie se queda afuera el día del
despliegue.

### Cómo entra la gente

`GET /api/auth/clientes` devuelve la lista, y el selector aparece en la pantalla
de ingreso **sólo cuando hay más de un cliente**. Para las siete tiendas que ya
usan esto, el día del despliegue no cambia nada.

El supermercado se manda explícito y **nunca se deduce de la contraseña**. Si se
dedujera, habría que probar la clave contra la base de cada cliente —lento a
propósito, porque el hash lo es— y, peor, si dos clientes eligieran la misma
contraseña entraría al que se revise primero.

Un cliente que no existe contesta **lo mismo que una contraseña equivocada**: si
dijera «ese supermercado no existe», la pantalla de ingreso serviría para
averiguar quiénes son los clientes.

### Detalles que cuestan caro si se pasan por alto

* **La lista de clientes vive en la base por defecto.** `create_all` crea la
  tabla `clientes` dentro de la base de cada cliente también, donde queda vacía
  y no significa nada. Por eso se lee siempre con `sesion_registro()` y nunca
  con la sesión del cliente que está pidiendo.
* **Un cliente nuevo arranca vacío.** El arranque siembra los pasillos de
  GALERIAS cuando la base está en cero; dárselos a otro supermercado sería peor
  que dejarlo vacío. La siembra quedó acotada al cliente por defecto.
* **Las conexiones se reparten.** Postgres Basic admite 100 en total, así que
  cada cliente abre un grupo chico (2 fijas, 3 de desborde) en vez de las 15 de
  fábrica de SQLAlchemy. Con eso entran unos quince supermercados antes de subir
  de instancia.
* **La URL se parsea, no se corta.** `?sslmode=require` es lo normal en un
  Postgres administrado. Cortando por la última barra, el nombre de la base se
  llevaría el parámetro puesto y la conexión del cliente nuevo saldría sin TLS.

### Cómo se da de alta un supermercado

```
cd backend
DATABASE_URL="<la de producción>" JWT_SECRET="<el del servicio>" \
  python ../scripts/alta_cliente.py olimpica "Olímpica"
```

Crea la base, sus tablas, la configuración y dos contraseñas al azar que
**imprime una sola vez**. No hay pantalla para esto a propósito: pediría inventar
un rol por encima del administrador —alguien que pueda tocar a TODOS los
supermercados—, que es justo la llave que no conviene que ande en un navegador.

### La copia de seguridad, con varios clientes

`scripts/respaldo.py` baja todo por HTTPS con la clave de admin — sin acceso al
servidor ni credenciales de la base. Con una base por cliente hubo que cambiarle
una cosa de fondo: **una sola clave no abre a todos**, porque cada supermercado
tiene la suya.

```
export RECABRA_CLAVE_GALERIAS='...'
export RECABRA_CLAVE_OLIMPICA='...'
python3 scripts/respaldo.py --base https://retail-espacios.onrender.com

# o uno solo, con RECABRA_CLAVE a secas
python3 scripts/respaldo.py --base https://... --cliente olimpica
```

Con un cliente solo alcanza `RECABRA_CLAVE`, que es como venía siendo: quien ya
lo tuviera programado no tiene que tocar nada.

**Cómo falla importa más que cómo funciona**, porque un respaldo se mira el día
que algo se rompió:

* Si falta la clave de un cliente, se copia el resto y **se dice cuál faltó**;
  la salida es 1, no 0.
* Si la copia quedó a medias, la carpeta se llama `...-INCOMPLETO`. El
  MANIFIESTO también lo dice, pero el nombre es lo que se ve cuando hay que
  restaurar apurado.
* Si no se copió ningún cliente, **no queda carpeta**. En una urgencia uno
  agarra la de fecha más nueva, y una carpeta vacía con la fecha de hoy es lo
  peor que puede encontrar ahí.
* Y sigue en pie la regla vieja: una copia sin ningún plano no sirve para
  volver, y lo avisa.

Se probó contra un servidor con dos clientes sembrados con datos distintos, y se
verificó que **la copia respeta el aislamiento**: la carpeta de cada uno tiene
sólo sus proveedores y sus sedes, sin rastro del otro.

### Cómo se probó

`backend/tests/test_clientes.py`, 17 pruebas. Para verificar que no son
decorativas se rompió el aislamiento a propósito —haciendo que
`cliente_del_pedido` ignore el token— y **siete pruebas fallaron**, incluidas
las cuatro que verifican que los datos no se cruzan.

La más exigente siembra un contrato de verdad en el primer cliente —proveedor,
marca, fechas, el mueble en el plano— y después pide lo mismo con el enlace de
montaje del segundo. Si la separación fallara, ahí saldría «Alpina».

Y en navegador, con dos clientes vivos: el selector aparece, cada uno entra al
suyo, y por API el primero tiene 41 espacios y el segundo 0.

---

## Gotchas

**La librería de Excel está vieja.** `xlsx@0.18.5` en npm arrastra vulnerabilidades
conocidas (prototype pollution, ReDoS) que sólo están corregidas en versiones que SheetJS
publica **fuera de npm**, en su propio CDN. Ya estaba en el proyecto para abrir adjuntos, y
la carga masiva le agrega una segunda entrada: siempre archivos que sube un admin
autenticado, nunca de terceros. Actualizarla implica cambiar el origen del paquete, así que
queda anotado y no hecho.


- `npm install` requiere `--legacy-peer-deps`.
- Las rutas de lista llevan barra final: `/api/spaces/`, `/api/layout/`.
- `JWT_SECRET` es una variable de entorno manual en Render, no viene del Blueprint.
- El login tiene rate limit: 10 intentos por IP cada 15 minutos, en memoria. Reiniciar el
  backend lo limpia (útil al automatizar pruebas).
- `/spaces/map`, `/dashboard/kpis` y `/dashboard/spaces` **existen pero no los llama
  nadie**: todo lo que se ve sale del JSON del layout, calculado en el navegador.
  `SpacePanel`, `StoreView` y `Legend` son componentes huérfanos. Antes de conectar esos
  endpoints hay que revisar que sus números coincidan con los del cliente.
- Quedan dos deudas que la revisión de fechas marcó como no urgentes: nada recalcula al
  **cruzar la medianoche** (una estación abierta todo el día queda anclada al día en que
  se montó la pantalla), y conviven **dos definiciones de "duración"** — el editor 3D y el
  correo de contrato nuevo cuentan exclusivo, así que un contrato del 1 al 24 de diciembre
  se anuncia como "23 días". Si se toca, hay que tocar los tres lugares juntos.
- `.github/workflows/deploy.yml` hace dos cosas distintas. En cada push y cada PR corre el
  **CI de verdad**: typecheck y build del frontend, `pytest` del backend. El **despliegue
  por SSH a un VPS** (no a Render) es opt-in: solo corre si la variable de repositorio
  `DEPLOY_TARGET` vale `vps`, junto con los secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY`.
  Sin eso se salta, no falla — que es lo que hacía desde junio y tenía los checks en rojo
  permanente.
- `npm ci` a secas falla acá: hay que usar `--legacy-peer-deps`, igual que el Dockerfile.
  `@react-three/drei@10` pide `fiber@^9` y el editor 3D está escrito contra `fiber@8`.
- `nginx/retail.conf` es para el despliegue en VPS, no para Render. Si ese VPS se reactiva,
  hay que copiar el archivo al host a mano — el workflow no lo despliega.

---

## Cómo probar de verdad

Los tres bugs peores aparecieron levantando la aplicación y mirándola, no leyendo el
código. Vale la pena el rato que toma:

1. Sembrar datos realistas en una base SQLite local.
2. Levantar backend (`:8000`) y Vite (`:5173`).
3. Conducir el navegador con Playwright y capturar. Chromium ya está instalado en
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

**Lo que es geometría pura, probarlo aparte.** `npm run probar` corre las seis suites
sin navegador (113 pruebas: planta, propuesta, nomenclatura, pasillos, revisión, acomodar): transpila el `.ts` con el esbuild que ya trae vite y
afirma en node. No hay runner de pruebas en el frontend y no valía la pena montar uno para
esto. Ahí se encontró que un paso largo saltaba por encima de un mueble.

**Después del 3D, los locators de Playwright dejan de resolver** aunque el DOM esté intacto:
el lienzo redibuja sin parar y el framework nunca lo considera estable. `page.evaluate` sigue
funcionando — despachar el clic sobre el nodo real ejecuta el mismo handler de React.

Para la sincronización, la prueba que importa es la de **dos clientes**: sembrar el
servidor, simular dos estaciones y verificar que las altas *y las bajas* viajan en ambos
sentidos, que un conflicto no pisa el trabajo del otro, y que una respuesta vacía del
servidor no borra la copia local.

**Sembrar siempre dos sedes con la misma nomenclatura.** `PUN-01` existe en NAVE y en
TERRON, y con una sola sede sembrada todo lo que confunde el código corto con el completo
pasa las pruebas. Así se encontró que el enlace del correo de montaje apuntaba a un código
que la pantalla nunca iba a encontrar.

Lo del mercaderista se prueba en **viewport de celular** (390×844) y con el enlace del
correo, no navegando a mano: entrar por `/?montar=SEDE-CODE` es el camino real, y ahí
aparecieron el `Content-Type` que rompía la foto y el doble montaje de StrictMode que se
comía el enlace.
