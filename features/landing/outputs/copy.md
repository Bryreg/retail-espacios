# Landing de RECABRA — copy final

Insumo único de diseño y frontend (Fase 9, orden de trabajo de la spec: copy → diseño → frontend).
Escrito contra el producto real: `docs/ESTADO.md` completo, `features/*/spec.md`, capturas de
`features/*/outputs/capturas/` y las maquetas `docs/maquetas/elegida-vender.png` /
`elegida-supervisar.png`.

**Todo lo que está entre comillas o en bloque `>` es texto final, listo para pegar.**
Lo que está entre corchetes `[COMPLETAR: …]` lo decide el dueño, no el diseño ni el frontend.
Lo que está en *cursiva bajo cada sección* es la **intención** y no se pega en ningún lado.

---

## 0. Decisiones de voz y reglas del copy

**Voz: español latino neutro, registro comercial formal (usted)** — fijado en la Fase 16 por
decisión del dueño, después de que la Fase 15 se quedara corta. El primer intento cambió los
verbos de voseo a usted y dejó intacto el registro: la página seguía leyéndose conversacional
—«esta es la pantalla que falta», «la plata», «sin vueltas», «no se hace de cabeza»— y el dueño lo
vio de inmediato en la página dibujada. **Conjugar en usted no es escribir formal.**

La regla, entonces, es de REGISTRO y no de conjugación:

- **Enunciativo, no conversacional.** Se describe lo que el sistema hace; no se le habla al lector
  como si estuviera del otro lado del mostrador. «El contrato se registra sobre el mueble», no
  «toque el mueble y llene la ficha».
- **Sin coloquialismos.** Prohibidos en el texto visible: «plata» (es *el valor*, *el canon*, *el
  ingreso*), «sin vueltas», «de cabeza», «se le caen», «andan hoy», «al toque», «acá» por «aquí»
  cuando se puede evitar la deixis.
- **Vocabulario del oficio, que no es jerga técnica.** Canon, sede, góndola, punta de góndola,
  mercaderista, proveedor, cuenta de cobro, vigencia, nomenclatura. La prohibición de jerga de la
  regla 4 sigue siendo sobre jerga de SOFTWARE, no sobre el idioma del retail.
- **Frases cortas igual.** Formal no es largo. Un punto por idea, como siempre.

El H1 también cambió: **«Recabre cada metro.»** El juego con el nombre de la marca es el mismo
—queda incluso más cerca de RECABRA escrito— pero en el registro de la página. Está fijado en
`backend/tests/test_landing_ataques.py::TITULAR_E`.

La aplicación por dentro sigue en voseo: cambiarla entera es otra fase, y una mezcla a mitad de
camino sería peor que cualquiera de las dos voces sostenidas.

Reglas duras del texto:

1. **Nada que el producto no haga.** Si no está en §12 («cifras verificadas») o en el código, no se
   escribe. La lista de lo que hay que evitar está en §14.
2. **Verbos concretos, no sustantivos abstractos.** «El contrato se registra sobre el mueble», no
   «optimización de la comercialización». Formal no es vago: la frase sigue diciendo qué pasa.
3. **Frases cortas.** Un punto por idea. Nada de subordinadas de tres renglones.
4. **Cero jerga técnica en la página.** Prohibido en el texto visible: multi-tenant, SaaS, JWT,
   endpoint, backend, snapshot, onboarding, dashboard, KPI, spread, benchmark, lazy-load.
   («Spread» y «benchmark» existen adentro del producto; afuera se dicen «cuánto se está corriendo
   de su propia tarifa» y «el promedio de los supermercados que usan RECABRA».)
5. **Plata siempre en pesos colombianos con puntos de miles y espacio después del signo**:
   `$ 1.200.000`. Nunca decimales. Nunca «COP».
6. **Fechas cortas en las tarjetas**: `24 sep`. Largas solo en el pie: `5 de septiembre de 2026`.
7. **Los estados se escriben, no solo se pintan.** Regla heredada del producto: el color nunca es la
   única señal (`docs/ESTADO.md`, «Paleta y tipografía»). Vale también para la landing.
8. **El plano es de ejemplo y lo dice en la propia página.** En texto visible, no en un comentario
   del HTML.

Glosario, para que las tres secciones y el frontend no inventen sinónimos:

| Decir | No decir |
|---|---|
| espacio / mueble / cara | «slot», «activo», «unidad» |
| canon (lo que paga el proveedor al mes) | «renta», «alquiler», «fee» |
| tarifa de referencia | «precio de lista», «rate card» |
| sede | «tienda», «punto de venta», «store» |
| mercaderista / trabajador de piso | «operario», «impulsador» |
| montaje | «instalación», «implementación» |
| proveedor | «marca», «cliente» (marca es la marca exhibida, campo aparte) |
| temporada | «campaña», «evento» |

---

## 1. Metadatos, SEO y compartido

`lang="es"` (ya está en `frontend/index.html`).

**`<title>`** (48 caracteres):

> RECABRA — Espacios comerciales de su supermercado

**`<meta name="description">`** (149 caracteres):

> Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo. RECABRA lleva la venta de espacios de exhibición de su supermercado, sede por sede.

**`<meta name="robots">`**: `index, follow`

**Open Graph**

| Propiedad | Valor |
|---|---|
| `og:site_name` | `RECABRA` |
| `og:title` | `RECABRA — Espacios comerciales de su supermercado` |
| `og:description` | `Dibuje el plano de cada sede, marque qué muebles se alquilan y venda tocando el mapa. Contratos, tarifas, vencimientos y montaje con foto.` |
| `og:type` | `website` |
| `og:url` | `https://retail-espacios.onrender.com/` |
| `og:locale` | `es_CO` |
| `og:image` | imagen local del repo, 1200 × 630 px — el plano isométrico de ejemplo con la leyenda de estados visible. **No una captura de un cliente real.** |
| `og:image:alt` | `Plano isométrico de un supermercado de ejemplo, con los muebles pintados según estén libres, por liberarse u ocupados.` |
| `twitter:card` | `summary_large_image` |

*Intención: que el enlace pegado en un WhatsApp o en un correo ya diga qué es, sin abrirlo.*

**Nota para el frontend (no es copy):** las fuentes hoy salen de `fonts.googleapis.com`
(`frontend/index.html`). La consigna de esta fase pide todo local. Si el diseño trae fuentes
propias, hay que empaquetarlas en el repo y revisar la CSP de Fase 3 en el mismo PR; si no, la
landing hereda Chivo + Archivo Narrow como están. Decisión de diseño/frontend, no del copy.

---

## 2. Hero

**Marca** (versales, con tracking positivo — regla de `docs/ESTADO.md`):

> RECABRA

**Antetítulo:**

> Espacios comerciales de supermercado

**Título (H1):**

> Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo.

**Frase de qué es (subtítulo 1):**

> RECABRA es el sistema con el que un supermercado administra y comercializa sus espacios de exhibición. Cada sede se representa en un plano, se define qué muebles son alquilables y el contrato se registra sobre el mueble.

**Subtítulo 2:**

> Cuando esa información está repartida entre hojas de cálculo, conversaciones y la memoria de cada persona, deja de ser administrable.

**CTA primario** → `/login#registro`:

> Crear mi cuenta

**CTA secundario** → `/login`:

> Ya tengo cuenta

**Línea bajo los botones:**

> El registro se hace con correo corporativo o con Google, y toma menos de un minuto.

**Rótulo del plano interactivo (arriba a la izquierda del plano, siempre visible):**

> Supermercado de ejemplo · Toque un mueble

**Nota chica bajo el plano:**

> Los datos del plano son ilustrativos. No corresponden a ningún supermercado real.

*Intención: en cinco segundos, un gerente que nunca oyó el nombre entiende que esto es para vender las puntas de góndola de su tienda, ve el piso de una tienda dibujado y siente que ya puede tocarlo. La duda que hay que matar acá es «¿esto es para mí o es un software de logística?».*

---

## 3. Funciones

**Título de sección:**

> Funciones

**Bajada:**

> Seis funciones, todas implementadas y en operación.

### Bloque 1

**Título:** `El inventario como plano, no como lista de códigos`

**Texto:**

> Cada sede se representa tal como está distribuida: góndolas, puntas, islas, neveras, bateas y cajas. Cada mueble conserva su código y sus medidas, y el plano muestra el estado de ocupación. Cuando el proveedor necesita evaluar cómo quedará la exhibición, la misma sede puede recorrerse en 3D.

**Pie del bloque:** `Plano 2D · vista 3D · una nomenclatura para toda la cadena`

### Bloque 2

**Título:** `El contrato se arma sobre el mueble`

**Texto:**

> Al seleccionar el espacio se completa una sola ficha: proveedor, marca, valor acordado y vigencia. Si el acuerdo cubre tres puntas de góndola, se seleccionan las tres y se genera un único contrato, con el total sumado. El valor es el que se pactó: el sistema no lo prorratea ni lo reinterpreta.

**Pie del bloque:** `Un proveedor, un periodo, todos los espacios que haga falta`

### Bloque 3

**Título:** `Disponibilidad por temporada comercial`

**Texto:**

> Al seleccionar el periodo —Amor y Amistad, Halloween, Black Friday, Navidad, regreso a clases— el plano se recalcula para esas fechas: disponible durante todo el periodo, con liberación intermedia, u ocupado. Un panel indica cuántos espacios quedan disponibles según la fecha de inicio del contrato. Un mueble que se desocupa el 25 es inventario comercializable desde hoy.

**Pie del bloque:** `Nueve temporadas del calendario comercial colombiano, con la ventana de venta que cada supermercado defina`

### Bloque 4

**Título:** `Tarifa de referencia y desviación`

**Texto:**

> Se registra una tarifa por tipo de mueble, con ajuste por sede cuando una tienda tiene mayor valor comercial. Al registrar el valor de un contrato, el sistema muestra la referencia y la desviación: «−17 % vs referencia». El tablero lista los contratos por debajo de tarifa para revisarlos en la próxima renovación.

**Pie del bloque:** `La tarifa la consulta el administrador. El mercaderista no accede a ningún valor.`

### Bloque 5

**Título:** `Notificaciones automáticas`

**Texto:**

> Al guardar un contrato se envían tres correos distintos: el área comercial recibe el acuerdo con el valor, el mercaderista recibe la orden de montaje sin ningún monto y con el enlace para reportar, y el proveedor recibe la constancia de su acuerdo. Antes del vencimiento el sistema notifica tres veces: a 30, 15 y 6 días. Con una semana de margen ya no queda espacio para renegociar; con un día, el aviso solo informa un hecho consumado.

**Pie del bloque:** `Al acercarse el vencimiento, la acción Renovar llega precargada con el proveedor, la marca y el valor vigente.`

### Bloque 6

**Título:** `Confirmación de montaje con evidencia fotográfica`

**Texto:**

> El correo del mercaderista incluye un enlace que abre directamente en el espacio asignado. Sin contraseña y sin acceso al tablero de la tienda: únicamente el mueble, su ubicación —«a unos 4 m de las cajas», señalada sobre el plano de la sala— y dos acciones. «Montado» exige fotografía. «No pude» exige motivo: sin motivo registrado no hay responsable identificable.

**Pie del bloque:** `La fotografía queda archivada. Es el respaldo ante un reclamo del proveedor meses después.`

**Cierre de la sección (una línea, después de los seis bloques):**

> Además: la temporada completa puede cargarse desde una planilla de Excel y revisarse fila por fila antes de crear ningún contrato, todas las sedes se administran desde la misma cuenta, y cada integrante del equipo se incorpora con el nivel de permiso que le corresponde.

*Intención: que reconozca su propio trabajo semana a semana en la pantalla. Cada bloque tiene que sonar a «esto lo hago yo los martes», no a una lista de funcionalidades. Si un bloque se puede decir de cualquier software, está mal escrito.*

---

## 4. Para quién, y qué gana cada uno

**Título de sección:**

> Tres perfiles, tres vistas distintas del mismo sistema

### Perfil 1

**Rótulo:** `Gerente o administrador`

**Titular:** `Decide con datos a la vista`

**Texto:**

> Dispone del plano, los valores y el calendario en una sola pantalla. Registra el contrato, fija el precio con la tarifa de referencia a la vista y conoce qué vence el mes siguiente. Puede mostrar el plano al proveedor durante la negociación: esa pantalla no expone el nombre ni el canon de ningún otro proveedor.

### Perfil 2

**Rótulo:** `Trabajador de piso`

**Titular:** `Ejecuta y reporta, sin acceso a valores`

**Texto:**

> Recibe un correo con el espacio asignado y un enlace que abre en su teléfono. Confirma con una fotografía o registra el motivo del incumplimiento. No accede con contraseña compartida ni ve valores: el servidor los suprime antes de enviar la pantalla.

### Perfil 3

**Rótulo:** `Proveedor`

**Titular:** `Recibe constancia de lo contratado`

**Titular alternativo (si el diseño necesita algo más corto):** `Constancia de lo contratado`

**Texto:**

> Recibe por correo la constancia de su acuerdo: qué espacios, en qué sede y con qué vigencia. Antes de firmar puede visualizar el mueble en 3D con su marca aplicada, en una lámina de antes y después que se adjunta al envío.

### Los indicadores disponibles en el tablero

**Bajada del bloque:**

> No son proyecciones. Son las cifras que el tablero calcula sobre los datos cargados.

| Cifra | Cómo se lee |
|---|---|
| **Ocupación** | `35 %` · 8 de 23 caras vendidas en el periodo |
| **Canon vigente** | ingreso mensual de los contratos vigentes |
| **Sin alquilar** | valor a tarifa de los espacios desocupados, y su equivalente por día |
| **Vence en 30 días** | espacios e ingreso mensual que se pierden si no se renuevan |
| **Sin montar** | contratos ya facturados cuyo montaje aún no se ha ejecutado |

**Línea de cierre del bloque:**

> Un contrato que cubre tres puntas de góndola se registra una vez, no tres.

*Intención: que el gerente se reconozca a él y a su gente; que entienda que darle acceso al mercaderista no le abre la caja; y que los beneficios se lean como cifras que él va a poder mirar, no como porcentajes de mejora inventados por un vendedor. La tabla es la prueba de que acá nadie promete «+30 % de ingresos».*

---

## 5. Implementación

**Título de sección:**

> Cómo se implementa

**Bajada:**

> Tres etapas. La primera toma un minuto; la segunda concentra el trabajo de levantamiento y se realiza una sola vez.

### Paso 1

**Número:** `1`
**Título:** `Creación de la cuenta y del supermercado`
**Texto:**

> El registro se hace con Google o con correo corporativo. Quien crea la cuenta queda como titular y desde ahí incorpora al equipo: cada integrante con su propio correo y con el nivel de permiso que le corresponde.

### Paso 2

**Número:** `2`
**Título:** `Levantamiento del plano de cada sede`
**Texto:**

> Los muebles se ubican según la distribución real de la sala y se marca cuáles son alquilables. Cajas y columnas quedan como referencia, en gris. Si los contratos de la temporada ya existen en una planilla, se cargan en un solo paso: el sistema reporta fila por fila cuáles proceden y cuáles presentan conflicto, antes de crear ningún registro.

### Paso 3

**Número:** `3`
**Título:** `Comercialización sobre el plano`
**Texto:**

> Se selecciona la temporada, se identifican los espacios disponibles y se registra el contrato sobre el mueble. Al guardar se envían los tres correos y el espacio cambia de estado en el plano.

**Nota bajo los tres pasos:**

> Cada supermercado inicia con el sistema vacío. RECABRA no incorpora datos de terceros.

*Intención: bajarle el miedo al paso 2, que es el único que cuesta, y dejar claro que el paso 3 es el trabajo de todos los días. Si alguien lee estos tres pasos y piensa «esto lo puedo hacer un sábado», la sección funcionó.*

---

## 6 y 7 · Asesoría y Confianza — RETIRADAS DE LA LANDING (Fase 16)

Las dos secciones se quitaron de la página por decisión del dueño. El texto no
se conserva acá para «tenerlo a mano»: este documento es lo que la página DICE,
y un bloque guardado en el mismo archivo del que la landing se escribe es una
invitación a que vuelva. El copy retirado vive en el historial de git
(`git log -p -- features/landing/outputs/copy.md`), que es donde va lo que ya
no se publica.

Lo que sí se movió y NO se perdió:

- **El enlace a la Política de Tratamiento de Datos.** Vivía en el bloque de
  Confianza y en el pie; ahora vive sólo en el pie, junto con el aviso de la
  Ley 1581 de 2012 y el Decreto 1377 de 2013. Es obligación legal, no copy
  comercial: no puede irse con la sección. `probar-landing.mjs` afirma que el
  pie lo tiene.
- **La numeración de las secciones visibles.** Con las dos afuera, la página
  quedó en cinco: 01 Funciones, 02 Para quién, 03 Implementación, 04 Precio,
  05 Cierre.

La asesoría sigue existiendo como servicio y las pantallas del operador siguen
en el producto (`/plataforma`). Lo que se quitó es la promesa en la página
pública, no la función.

## 8. Precio y modelo comercial

**Título de sección:**

> Modelo comercial

**Precio:**

> `[COMPLETAR: precio]` `[COMPLETAR: unidad — por supermercado al mes, por sede al mes, o lo que corresponda]`

**Cómo se paga:**

> Pago por transferencia bancaria contra cuenta de cobro. No se utiliza pasarela de pagos ni se solicitan datos de tarjeta.

**Qué pasa si un mes se atrasa (bloque de tres líneas):**

> - Primer aviso en pantalla; el servicio continúa sin cambios.
> - Si la mora persiste, la cuenta pasa a solo lectura: se conserva el acceso y la consulta, pero no se registran contratos nuevos.
> - Los datos no se eliminan en ningún caso. Regularizada la cuenta, la operación se reanuda donde quedó.

**Contacto:**

> Para cadenas regionales o multisede, escríbanos a `[COMPLETAR: correo de contacto]` y evaluamos el alcance en conjunto.

**CTA de la sección:** `Hablemos` → `mailto:[COMPLETAR: correo de contacto]`

*Intención: que el precio no sea una emboscada y que la forma de pago local (transferencia + cuenta de cobro) se lea como normal y no como algo improvisado. El bloque del atraso es a propósito: contarlo antes de que pase es lo que hace que se crea el resto de la página.*

---

## 9. CTA final

**Título:**

> Empiece por una sede

**Texto:**

> Comience por la sede con mayor volumen de espacios comercializables y evalúe la disponibilidad de esta temporada. Si el resultado es útil, incorpore las demás.

**CTA primario** → `/login#registro`:

> Crear mi cuenta

**CTA secundario** → `/login`:

> Ya tengo cuenta

**Línea de cierre bajo los botones:**

> Registro con Google o con correo corporativo. El plano de esta página es un ejemplo; el de cada supermercado se levanta con sus propias sedes.

*Intención: bajar el compromiso a lo mínimo creíble —una sede, no la cadena— y dejar el último gesto de la página siendo un botón, no un párrafo.*

---

## 10. Pie legal

**Marca y descriptor:**

> RECABRA · Gestión de espacios comerciales en supermercados

**Columna de enlaces — Producto**

- `Qué hace` → `#que-hace`
- `Cómo se usa` → `#como-se-usa`
- `Precio` → `#precio`

**Columna de enlaces — Cuenta**

- `Crear mi cuenta` → `/login#registro`
- `Ya tengo cuenta` → `/login`

**Columna de enlaces — Legal**

- `Política de Tratamiento de Datos` → `/politica-datos`
- `Tratamiento de datos y derechos del titular` → `/politica-datos#derechos`

**Línea legal (texto corrido):**

> `[COMPLETAR: razón social]` · NIT `[COMPLETAR: NIT]` · `[COMPLETAR: ciudad, Colombia]`
> Tratamiento de datos personales conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013.
> Para ejercer sus derechos como titular, escriba a `[COMPLETAR: correo de protección de datos]`.

**Copyright:**

> © `[año en curso]` RECABRA. Todos los derechos reservados.

**Nota chica final:**

> El plano de esta página corresponde a un supermercado ficticio, definido en el código de la propia página. No representa a ningún cliente.

*Intención: cerrar con lo obligatorio, sin que el pie se convierta en un mapa del sitio de veinte enlaces. Los `[COMPLETAR]` de razón social y NIT son los mismos que ya están abiertos en `docs/legal/politica-datos.md`: no inventar ninguno.*

---

## 11. Microcopy

### 11.1 Botones y controles

| Dónde | Texto |
|---|---|
| CTA primario (hero y cierre) | `Crear mi cuenta` |
| CTA secundario | `Ya tengo cuenta` |
| CTA de la sección de precio | `Hablemos` |
| Acercar el plano | `Acercar` (ícono `+`) |
| Alejar el plano | `Alejar` (ícono `−`) |
| Volver al encuadre inicial | `Centrar` |
| Pasar a la vista 3D | `Ver en 3D` |
| Volver del 3D al plano | `Volver al plano` |
| Cargando la vista 3D | `Cargando la vista 3D…` |
| Cerrar la tarjeta de un mueble (móvil) | `Cerrar` |
| Enlace de sección en el pie | `Volver arriba` |

**Ayuda del plano (una línea, debajo de los controles, siempre visible en escritorio):**

> Arrastrá para moverte. Ctrl + rueda para acercar. Tocá un mueble para ver su ficha.

**La misma en móvil:**

> Deslizá para moverte. Pellizcá para acercar. Tocá un mueble.

**Ayuda de teclado (visible al enfocar el plano con Tab):**

> Flechas para moverte · `+` y `−` para acercar · `Enter` para abrir la ficha del mueble · `Esc` para cerrarla

### 11.2 Tarjeta del mueble (la que aparece al pasar el mouse o al tocar)

Orden de los campos y textos fijos:

```
GON-04·A                      ← código, en la fuente de códigos
Góndola, por cara             ← tipo, con el nombre del catálogo real
Pasillo 3 · sede CENTRO       ← ubicación en palabras · sede
──────────────────────────────
● Tomado                      ← estado, siempre con la palabra al lado del punto
Lácteos Monteverde            ← proveedor de ejemplo
$ 1.100.000 al mes            ← canon
hasta el 28 sep               ← fin del contrato
──────────────────────────────
Proveedor y valores de ejemplo   ← nota fija, en el pie de CADA tarjeta con contrato
```

Variantes por estado, con el texto exacto de cada línea:

| Estado | Línea de estado | Líneas siguientes |
|---|---|---|
| Libre todo el periodo | `● Libre todo el periodo` | `Tarifa de referencia` · `$ 1.150.000 al mes` |
| Se libera en el periodo | `● Se libera en el periodo` | proveedor de ejemplo · `$ 900.000 al mes` · `libre desde el 26 sep` |
| Tomado | `● Tomado` | proveedor de ejemplo · canon · `hasta el 28 sep` |
| Resto de la sala | `● Resto de la sala` | `No se alquila. Es parte del local.` |

**Nota fija al pie de las tarjetas con proveedor y valores:**

> Proveedor y valores de ejemplo

### 11.3 Leyenda de colores

Título de la leyenda:

> Estado en el periodo

Las cuatro entradas, con el mismo texto que usa la aplicación por dentro
(`DashboardView.tsx`) — **no cambiarlo, la landing tiene que enseñar el idioma de adentro**:

| Color | Texto |
|---|---|
| verde | `Libre todo el periodo` |
| naranja | `Se libera en el periodo` |
| rojo | `Tomado` |
| gris | `Resto de la sala` |

Línea bajo la leyenda:

> Es la misma lectura que tendrá dentro del sistema, con su propia tienda.

### 11.4 Estados vacíos y de error del plano

| Situación | Texto |
|---|---|
| El plano no pudo dibujarse | `No pudimos dibujar el plano de ejemplo. El resto de la página funciona igual.` |
| El plano no pudo dibujarse — acción | `Reintentar` |
| El 3D no pudo cargar | `No pudimos abrir la vista 3D en este dispositivo. El plano de arriba sigue disponible.` |
| El 3D no pudo cargar — acción | `Volver al plano` |
| El navegador no soporta la vista 3D | `Este navegador no puede mostrar la vista 3D. Adentro de RECABRA vas a poder abrirla desde un equipo de escritorio.` |
| `prefers-reduced-motion` activo, aviso opcional | `Animaciones reducidas, según la preferencia configurada en su sistema.` |
| Ningún mueble bajo el cursor (panel lateral del plano, si el diseño lo usa) | `Pasá el mouse por un mueble para ver su ficha.` |
| Lo mismo en móvil | `Tocá un mueble para ver su ficha.` |

### 11.5 Texto alternativo (`alt`) y accesibilidad

**`alt` del plano isométrico** (cuando el plano se sirve como imagen o como fallback estático):

> Plano isométrico de un supermercado de ejemplo, visto desde arriba en perspectiva. Dieciséis muebles alquilables pintados según su estado —verde libre, naranja se libera, rojo tomado— entre pasillos, cajas y neveras en gris que no se alquilan.

**Descripción larga, para lectores de pantalla (`aria-describedby` o `<figcaption>` visualmente oculto):**

> Supermercado de ejemplo con dos sedes. En la sede CENTRO hay diez espacios alquilables: cuatro libres, dos que se liberan dentro del periodo y cuatro tomados. En la sede PALMAS hay seis: tres libres, uno que se libera y dos tomados. Cada espacio tiene un código, un tipo de mueble, un proveedor de ejemplo y un canon mensual. Los datos son inventados.

**Etiqueta accesible del plano (`aria-label` del contenedor interactivo):**

> Plano interactivo de un supermercado de ejemplo. Usá las flechas para moverte y Enter para abrir la ficha de un mueble.

**Textos de la tabla equivalente** (alternativa accesible al plano; el diseño decide si va visible o en un `<details>`):

- Resumen: `Los mismos datos del plano, en tabla`
- Encabezados: `Código` · `Tipo` · `Sede` · `Estado` · `Proveedor de ejemplo` · `Canon mensual`

**`alt` de las capturas de la aplicación, si el diseño las usa en «Cómo se usa»:**

- Pantalla de venta: `Pantalla de venta de RECABRA: el plano de la sede a la izquierda y la ficha del contrato a la derecha, con proveedor, marca, fechas y el total del plazo.`
- Pantalla de supervisión: `Tablero de RECABRA: canon vigente, espacios sin alquilar, contratos que vencen en 30 días, ocupación y contratos sin montar, con el plano y la lista de espacios debajo.`
- Pantalla de montaje en el celular: `Pantalla de montaje en un teléfono: el mueble a montar, dónde queda en la sala y dos botones, montado o no pude.`

**Nota para el frontend (no es copy):** la spec pide capturas reales claro/oscuro para «Cómo se usa». Hoy en el repo hay capturas de la consola del operador (`features/asesoria/`, `features/transparencia/`, `features/asesoria-detalle/`) y las **maquetas** de la pantalla de sede en `docs/maquetas/elegida-vender.png` y `elegida-supervisar.png`. **Las capturas de la consola del operador no van en la landing**: muestran la pantalla de RECABRA, no la del cliente, y llevan datos de un cliente de prueba. Si hacen falta capturas de la pantalla de sede, se generan con `docs/maquetas/generadores/pantalla.mjs`, que sirve una sede sintética — nunca contra la base de producción.

### 11.6 Ancla de secciones (para los enlaces del pie y la navegación)

`#que-hace` · `#para-quien` · `#como-se-usa` · `#asesoria` · `#confianza` · `#precio`

---

## 12. Cifras verificadas: de dónde sale cada número de esta página

**Regla: si un número no está en esta tabla, no se escribe en la landing.**

| Cifra que se usa | Valor | Verificado en |
|---|---|---|
| Avisos de vencimiento | **30, 15 y 6 días** (configurable; ese es el valor por defecto) | `backend/app/services/reminders.py` — `get_config(db, "reminder_days", "30,15,6")` |
| Correos al guardar un contrato | **3** (comercial, montaje, proveedor) | `backend/app/routers/spaces.py`; `docs/ESTADO.md`, «El correo de un contrato» |
| El enlace de montaje vence en | **30 días** | `backend/app/auth.py` — `MONTAJE_TTL_DAYS = 30` |
| Tope de filas por planilla | **300** | `backend/app/routers/bulk_leases.py` — `MAX_FILAS = 300` |
| El botón «Renovar» aparece cuando faltan | **60 días o menos** | `docs/ESTADO.md`, «Renovar» |
| Temporadas del calendario | **9**: Escolar, Semana Santa, Día de la Madre, Día del Padre, Vacaciones, Amor y Amistad, Halloween, Black Friday, Navidad | `frontend/src/types/seasons.ts` |
| Tipos de mueble con tarifa propia | **15** | `frontend/src/types/fixtures.ts` — `RATE_TYPES` |
| Umbral de marcado del desvío vs tarifa | **1 %** | `docs/ESTADO.md`, «Tarifa de referencia» |
| Ejemplo del total del contrato | `$ 1.500.000 + $ 1.550.000 = $ 3.050.000` (dos espacios en el mismo acuerdo) | Fase 17: el valor acordado NO se prorratea — se suma. Ver `frontend/src/components/Contrato/Contrato.tsx` |
| Ejemplo de ocupación | `35 %`, 8 de 23 caras | `docs/maquetas/elegida-supervisar.png` (datos sintéticos) |
| Roles | **3**: dueño de la cuenta, administrador, trabajador de piso | `features/identidad/spec.md` — `owner` / `admin` / `worker` |
| Estados de la cuenta | **4**: `activo`, `gracia` (que en la landing se dice «te avisamos»), `solo_lectura`, `suspendido` | `features/clientes/spec.md` |
| Marco legal | **Ley 1581 de 2012 · Decreto 1377 de 2013** | `docs/legal/politica-datos.md` |

**Cifras que existen en el producto pero NO van en la landing** (son de la consola del operador, no del
supermercado): número de clientes de la plataforma, ingreso consolidado, benchmark por tipo con
desglose, cohortes de adopción. Publicarlas sería contar el negocio de terceros.

---

## 13. Datos de ejemplo para el plano isométrico

**Todo lo de acá es inventado.** No sale de ninguna base de cliente, no se parece a `galerias` ni a
sus sedes reales (NAVE, POBLADO, ciudad jardín), y los proveedores no son marcas existentes. Va
sembrado en el código de la landing, sin ninguna llamada a `/api/*`.

### El supermercado

| Campo | Valor |
|---|---|
| Nombre | **MercaFresco** |
| Cómo se rotula en la página | `Supermercado de ejemplo` |
| Sedes | **CENTRO** y **PALMAS** |
| Periodo del plano | `1 → 30 de septiembre` (temporada Amor y Amistad adentro) |
| Muebles alquilables | 16 (10 en CENTRO, 6 en PALMAS) |
| Muebles de contexto | los que haga falta para que se vea una tienda: pasillos de góndola, cajas, columnas, mostrador. Ver la nota de escala al final. |

`MercaFresco` es el nombre que el propio repo ya usa como cliente de prueba (aparece en las capturas
de `features/transparencia/` y `features/asesoria-detalle/`). Si el dueño prefiere otro, se cambia en
un solo lugar: es una constante, no está escrito en el copy de ninguna sección.

### Proveedores de ejemplo (inventados)

`Lácteos Monteverde` · `Bebidas Zafiro` · `Galletas Doña Rita` · `Café Alto Bosque` ·
`Cárnicos San Isidro` · `Aseo Rocío` · `Confites Milagro` · `Frutas del Ocaso`

Ninguno corresponde a una empresa real. **No reemplazar por marcas reales**, ni siquiera «para que se
vea más creíble»: poner Alpina o Postobón en un plano público es afirmar una relación comercial que
no existe.

### Sede CENTRO — 10 espacios alquilables

| Código | Tipo | Ubicación en palabras | Estado | Proveedor de ejemplo | Canon mensual | Fecha |
|---|---|---|---|---|---|---|
| `PUN-01` | Punta de góndola | Frente a la entrada | **Tomado** | Bebidas Zafiro | `$ 1.300.000` | hasta el 28 sep |
| `PUN-02` | Punta de góndola | Pasillo 2, de cara a las cajas | **Se libera en el periodo** | Confites Milagro | `$ 1.150.000` | libre desde el 26 sep |
| `PUN-05` | Punta de góndola | Pasillo 5, contra la pared del fondo | **Libre todo el periodo** | — | `$ 1.000.000` (tarifa) | — |
| `EXP-01` | Isla | Frente a la entrada | **Tomado** | Galletas Doña Rita | `$ 1.200.000` | hasta el 30 nov |
| `EXP-02` | Isla | A 3 m de las cajas | **Libre todo el periodo** | — | `$ 1.200.000` (tarifa) | — |
| `CRS-01` | Exhibición de piso | Pasillo central | **Se libera en el periodo** | Aseo Rocío | `$ 900.000` | libre desde el 22 sep |
| `GON-04·A` | Góndola, por cara | Pasillo 3, lado par | **Tomado** | Lácteos Monteverde | `$ 240.000` | hasta el 31 oct |
| `GON-04·B` | Góndola, por cara | Pasillo 4, lado impar | **Libre todo el periodo** | — | `$ 230.000` (tarifa) | — |
| `BEB-01` | Nevera de bebidas | Pared de refrigerados | **Tomado** | Bebidas Zafiro | `$ 450.000` | hasta el 30 nov |
| `FRU-02` | Frutas y verduras | Entrada, mano derecha | **Libre todo el periodo** | — | `$ 380.000` (tarifa) | — |

### Sede PALMAS — 6 espacios alquilables

| Código | Tipo | Ubicación en palabras | Estado | Proveedor de ejemplo | Canon mensual | Fecha |
|---|---|---|---|---|---|---|
| `PUN-01` | Punta de góndola | Frente a la entrada | **Tomado** | Café Alto Bosque | `$ 1.100.000` | hasta el 15 dic |
| `PUN-03` | Punta de góndola | Pasillo 3, de cara a las cajas | **Libre todo el periodo** | — | `$ 1.000.000` (tarifa) | — |
| `CAJ-02` | Cabecera de caja | Caja 2 | **Se libera en el periodo** | Confites Milagro | `$ 850.000` | libre desde el 24 sep |
| `ISL-01` | Isla de congelados | Zona de congelados | **Tomado** | Cárnicos San Isidro | `$ 700.000` | hasta el 31 oct |
| `GON-11·A` | Góndola, por cara | Pasillo 1, lado par | **Libre todo el periodo** | — | `$ 230.000` (tarifa) | — |
| `BAT-01` | Batea | Pasillo central | **Libre todo el periodo** | — | `$ 320.000` (tarifa) | — |

### Muebles de contexto (gris, «Resto de la sala»)

No se alquilan y no llevan tarjeta con valores. Si el diseño les pone tarjeta, dice
`No se alquila. Es parte del local.`

`CAJ-01` · `CAJ-03` · `CAJ-04` · `CAJ-05` (cajas registradoras) · `SAC-01` (mostrador de servicio al
cliente) · `COL-01` a `COL-06` (columnas) · las corridas de góndola que no están marcadas como
alquilables · la pared de refrigerados.

### Reglas de la escena, para que se lea como una tienda

1. **El gris es mayoría.** En una sede real de este producto, 19 de 104 muebles son alquilables
   (`docs/ESTADO.md`, «Qué hay de verdad en los planos»). En el plano de ejemplo, los 16 de color
   tienen que estar rodeados de bastante gris: si todo el piso está pintado, no se entiende que lo
   que se vende es escaso, que es justamente el argumento.
2. **Los códigos son cortos adentro del plano** (`PUN-01`), como en la aplicación. El nombre de la
   sede va como rótulo aparte, no pegado al código. Es la regla de nomenclatura del producto y la
   landing tiene que enseñarla bien.
3. **Las dos caras de una góndola son dos espacios**, y por eso `GON-04·A` y `GON-04·B` pueden tener
   estados distintos. Eso se ve o no se entiende el modelo.
4. **Los prefijos son los del código real** (`frontend/src/utils/nomenclatura.ts`): góndola `GON`,
   punta `PUN`, isla `EXP`, isla de congelados `ISL`, exhibición de piso `CRS`, nevera de bebidas
   `BEB`, frutas y verduras `FRU`, batea `BAT`, cabecera de caja `CAJ`, mostrador `SAC`, columna
   `COL`. No inventar prefijos nuevos.
5. **La proporción de estados está elegida**: 7 libres, 3 que se liberan, 6 tomados. Suficiente verde
   para que se vea que hay inventario, suficiente rojo para que se vea que se vende, y naranja
   suficiente para que la leyenda tenga sentido.
6. **Un solo mueble arranca con la tarjeta abierta** al cargar la página —`PUN-02`, el que se libera
   el 26— para que se entienda el gesto sin tener que descubrirlo. Se cierra al primer toque en
   cualquier otro lado.

---

## 14. Lo que NO prometemos

Lista para diseño y frontend: **nada de esto existe hoy**, así que no puede aparecer en un titular,
en un ícono, en una comparación ni en un texto de relleno. Si al diseñar «queda un hueco» y la
tentación es llenarlo con algo de esta lista, el hueco se queda.

**Dinero y facturación**

1. **No hay pasarela de pagos.** Ni tarjeta, ni PSE, ni Nequi, ni pagos en línea de ningún tipo — ni
   para pagarnos a nosotros ni para que el proveedor le pague al supermercado. Es transferencia y
   cuenta de cobro, decidido a propósito.
2. **No emite facturación electrónica** ni se integra con la DIAN.
3. **No hay prueba gratis, ni plan gratuito, ni «14 días sin tarjeta»** anunciados como tales.
   Cualquier condición comercial la escribe el dueño en `[COMPLETAR: precio]`.
4. **No cobra ni gestiona la cobranza al proveedor.** RECABRA registra el acuerdo; cobrar lo sigue
   haciendo el supermercado.

**Contratos y documentos**

5. **No genera el documento legal del contrato ni lo firma.** El botón dice «Guardar contrato y
   avisar»: registra el acuerdo y manda los correos. No hay PDF de contrato, ni firma electrónica,
   ni envío a firmar.
6. **No se puede editar un contrato ya guardado.** Se cancela y se hace de nuevo. No prometer
   «edición».
7. **No hay un flujo de aprobaciones** («en negociación / aprobado / rechazado»). Se construyó y se
   descartó a propósito.

**Integraciones y plataformas**

8. **No se integra con ningún ERP** —Siesa, SAP, World Office, ninguno—, ni con el POS, ni con
   inventarios, ni con Excel en vivo (la planilla se sube a mano, es un archivo).
9. **No hay API pública** para que otro sistema le hable.
10. **No hay aplicación nativa de iOS ni de Android.** La pantalla del mercaderista es una página web
    que abre bien en el celular. No decir «app», decir «desde el celular».
11. **No manda WhatsApp ni SMS.** Los avisos son por correo.
12. **No funciona sin internet.** El plano se puede leer de un caché del navegador, pero no es una
    función ofrecida ni prometida.

**Análisis y datos**

13. **El supermercado no tiene un panel de recomendaciones dentro de su cuenta.** Las
    recomendaciones, las oportunidades y la tendencia se producen en la consola de RECABRA y llegan
    por la sesión de asesoría. Decir «le aparecen en su tablero» sería falso. La sección de asesoría
    (§6) está escrita para no prometer eso.
14. **No mide ventas, tráfico, impresiones ni conversión.** El sistema no sabe cuánto vendió el
    proveedor en esa punta. No hay sensores, no hay reconocimiento de imagen, no hay auditoría
    automática de anaquel — está explícitamente en «no perseguir» del backlog.
15. **No hay ranking de rendimiento por metro cuadrado** y no debe volver: se sacó a propósito.
16. **No hay histórico por espacio** («a cuánto se cerró este mueble antes»). Está en el backlog, no
    en el producto.
17. **No hay histórico de la oportunidad de precio** mes a mes.
18. **La tendencia arranca vacía** el día que el supermercado entra. No se rellena hacia atrás — eso
    sería inventar datos. No prometer «mire su último año».
19. **No hay pronósticos ni predicciones.** Ninguna cifra de la página puede decir «va a».

**Equipo y permisos**

20. **Hay tres roles y ninguno más**: dueño de la cuenta, administrador y trabajador de piso. No hay
    permisos a la medida, ni roles por sede, ni «solo lectura para el contador».
21. **El proveedor no tiene cuenta ni portal.** Recibe correos y, si el comercial se la manda, la
    lámina de su exhibición. No entra a ningún lado.

**Cifras y comparaciones**

22. **Ninguna cifra de impacto de negocio.** Nada de «+30 % de ingresos», «recupere el 20 % de sus
    espacios», «ahorre 10 horas al mes». El documento del proyecto verificó una por una las cifras
    que circulan en esta industria y **ninguna se sostiene** (`docs/ESTADO.md`, «Sobre las cifras que
    solían estar acá»). Escribir una acá sería repetir un error ya corregido.
23. **Ningún nombre de cliente real, ningún logo de supermercado, ningún testimonio.** No hay
    testimonios que citar. No hay «lo usan N supermercados». No hay logos de proveedores reales.
24. **Ninguna comparación con un competidor por nombre.**

**Producto y disponibilidad**

25. **No hay soporte 24/7, ni chat en vivo, ni tiempos de respuesta comprometidos.** El canal es un
    correo.
26. **No hay migración de datos asistida** ni «te lo montamos nosotros» como servicio anunciado.
27. **No hay certificaciones de seguridad** (ISO, SOC 2, ninguna). Lo que sí se puede decir está en
    §7 y nada más.
28. **La copia de seguridad y la disponibilidad no se prometen con números.** Nada de «99,9 %».

---

## 15. Cómo sigue esto

- **Diseño** recibe este archivo y `features/landing/spec.md`, y nada más — ni capturas de la
  aplicación, ni la paleta actual, ni los tokens `--con-*`. Es la indicación de la spec.
- **Frontend** construye con este archivo y `outputs/diseno.md`. Si un texto no le entra en el
  espacio que el diseño propone, la salida es **avisar y pedir el recorte acá**, no reescribirlo en
  el `.tsx`: el copy tiene una sola fuente.
- Los `[COMPLETAR: …]` que quedan abiertos y que el dueño tiene que cerrar antes de publicar:
  **precio**, **unidad del precio**, **correo de contacto**, **correo de protección de datos**,
  **razón social**, **NIT** y **ciudad**. La página se puede construir y revisar con los marcadores
  puestos; no se despliega con ellos.
