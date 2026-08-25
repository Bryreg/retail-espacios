# Galerías — estado del proyecto

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

**Lo que es geometría pura, probarlo aparte.** `npm run probar:planta` corre las 15 pruebas
de `src/utils/planta.ts` sin navegador: transpila el `.ts` con el esbuild que ya trae vite y
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
