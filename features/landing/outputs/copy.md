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

**Voz: español latino neutro, formal (usted)** — cambiado en la Fase 15 por decisión del dueño.
Antes era voseo («dibujás», «vendés», «cargá»), elegido por consistencia con el interior de la
aplicación; la landing le habla a alguien que todavía no es cliente, y ahí la cortesía pesa más que
la cercanía. Sigue siendo **liviano**: usted sin solemnidad, frases cortas, y el mismo vocabulario
colombiano de retail (canon, sede, góndola, punta de góndola, mercaderista, proveedor, cuenta de
cobro). **No mezclar con tuteo ni con voseo en ninguna pantalla de la landing.**

La aplicación por dentro sigue en voseo: cambiarla entera es otra fase, y una mezcla a mitad de
camino sería peor que cualquiera de las dos voces sostenidas. La única excepción declarada es el
H1 —«Recabrá cada metro.»—, que es el juego con el nombre de la marca y lo eligió el dueño: se
deja como está hasta que él diga lo contrario.

Reglas duras del texto:

1. **Nada que el producto no haga.** Si no está en §12 («cifras verificadas») o en el código, no se
   escribe. La lista de lo que hay que evitar está en §14.
2. **Verbos, no sustantivos abstractos.** «Vendés espacios tocando el mapa», no «optimización de la
   comercialización».
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

> RECABRA es el sistema con el que un supermercado vende sus espacios de exhibición. Dibuje el plano de cada sede, marque qué muebles se alquilan y arme el contrato ahí mismo, tocando el mueble.

**Subtítulo 2:**

> Si hoy eso vive en un Excel, en un chat de WhatsApp o en la memoria de alguien, esta es la pantalla que falta.

**CTA primario** → `/login#registro`:

> Crear mi cuenta

**CTA secundario** → `/login`:

> Ya tengo cuenta

**Línea bajo los botones:**

> Entre con su correo o con Google. Crear la cuenta y su supermercado toma un minuto.

**Rótulo del plano interactivo (arriba a la izquierda del plano, siempre visible):**

> Supermercado de ejemplo · Tocá un mueble

**Nota chica bajo el plano:**

> Los datos del plano son inventados, para mostrar cómo se ve. Ningún supermercado real aparece acá.

*Intención: en cinco segundos, un gerente que nunca oyó el nombre entiende que esto es para vender las puntas de góndola de su tienda, ve el piso de una tienda dibujado y siente que ya puede tocarlo. La duda que hay que matar acá es «¿esto es para mí o es un software de logística?».*

---

## 3. Qué hace

**Título de sección:**

> Lo que hace

**Bajada:**

> Seis cosas concretas. Todas están construidas y andan hoy.

### Bloque 1

**Título:** `El plano de su tienda, no una lista de códigos`

**Texto:**

> Dibuje cada sede como es: góndolas, puntas, islas, neveras, bateas, cajas. Cada mueble queda con su código y sus medidas. En el plano se ve de un vistazo qué está libre y qué está tomado, y cuando el proveedor quiere ver cómo le va a quedar la exhibición, la misma tienda se recorre en 3D.

**Pie del bloque:** `Plano 2D · vista 3D · una nomenclatura para toda la cadena`

### Bloque 2

**Título:** `El contrato se arma sobre el mueble`

**Texto:**

> Toque el espacio y llene una sola ficha: proveedor, marca, canon mensual, desde y hasta. Si el acuerdo cubre tres puntas de góndola, las toca las tres y queda un solo contrato, no tres. Abajo del formulario está el total del plazo, que es lo que se firma: $ 1.500.000 al mes por 61 días son $ 3.050.000, y esa cuenta ya no se hace de cabeza con el proveedor esperando.

**Pie del bloque:** `Un proveedor, un periodo, todos los espacios que haga falta`

### Bloque 3

**Título:** `Qué hay libre en la temporada que está vendiendo`

**Texto:**

> Elija el periodo —Amor y Amistad, Halloween, Black Friday, Navidad, regreso a clases— y el plano entero se repinta para ese periodo: libre todo el tiempo, se libera adentro, o tomado. Un panel le dice cuántos espacios hay libres si el contrato arranca el 26 y cuántos si arranca el 29. Un mueble que se desocupa el 25 es inventario que puede ofrecer hoy.

**Pie del bloque:** `Nueve temporadas del calendario colombiano, con la ventana de venta que usted defina`

### Bloque 4

**Título:** `Su tarifa, y cuánto se está corriendo de ella`

**Texto:**

> Cargue una tarifa por tipo de mueble, con ajuste por sede si una tienda vale más que otra. Cuando escribe el valor de un contrato, al lado le aparece la referencia y el desvío: «−17 % vs referencia». En el tablero hay una lista de todo lo que está por debajo de tarifa, para revisarlo en la próxima renovación.

**Pie del bloque:** `La tarifa la ve el administrador. El mercaderista no ve un solo peso.`

### Bloque 5

**Título:** `Los avisos salen solos`

**Texto:**

> Al guardar un contrato salen tres correos distintos: el comercial recibe el acuerdo con el valor, el mercaderista recibe la orden de montaje sin un solo monto y con el enlace para reportar, y el proveedor recibe la constancia de lo suyo. Antes de vencer, el sistema avisa tres veces: a 30, a 15 y a 6 días. A una semana ya no hay margen para negociar; a un día el correo llega para contar algo que ya pasó.

**Pie del bloque:** `Y cuando falta poco, el botón Renovar viene con el proveedor, la marca y el valor que se está pagando ya escritos.`

### Bloque 6

**Título:** `El montaje se confirma con foto, desde el celular`

**Texto:**

> El correo del mercaderista trae un enlace que abre directo en el espacio que le toca. Sin contraseña y sin ver el tablero de la tienda: solo el mueble, dónde queda —«a unos 4 m de las cajas», con el plano de la sala señalado— y dos botones. «Montado» exige foto. «No pude» exige motivo, porque sin motivo no se sabe a quién reclamarle.

**Pie del bloque:** `La foto queda guardada. Es la que responde el reclamo del proveedor tres meses después.`

**Cierre de la sección (una línea, después de los seis bloques):**

> Y además: cargue la temporada entera desde una planilla de Excel, revise fila por fila antes de crear nada, maneje todas sus sedes desde la misma cuenta e invite a su equipo con el permiso que le toca a cada uno.

*Intención: que reconozca su propio trabajo semana a semana en la pantalla. Cada bloque tiene que sonar a «esto lo hago yo los martes», no a una lista de funcionalidades. Si un bloque se puede decir de cualquier software, está mal escrito.*

---

## 4. Para quién, y qué gana cada uno

**Título de sección:**

> Tres personas usan esto, y cada una ve otra cosa

### Perfil 1

**Rótulo:** `Gerente o administrador`

**Titular:** `Vende con datos, no de memoria`

**Texto:**

> Ve el plano, la plata y el calendario en la misma pantalla. Arma el contrato, pone el precio con la tarifa al lado y sabe qué se le cae el mes que viene. Puede girar el portátil y mostrarle el plano al proveedor que tiene enfrente: esa pantalla no muestra el nombre ni el canon de ningún otro proveedor.

### Perfil 2

**Rótulo:** `Trabajador de piso`

**Titular:** `Monta y reporta, sin ver dinero`

**Texto:**

> Le llega un correo con el espacio que le toca y un enlace que abre en su celular. Confirma con una foto o dice qué pasó. No entra con una contraseña compartida y no ve valores: el sistema le borra la plata antes de mandarle la pantalla.

### Perfil 3

**Rótulo:** `Proveedor`

**Titular:** `Sabe qué compró`

**Titular alternativo (si el diseño necesita algo más corto):** `Ve lo que compró`

**Texto:**

> Recibe por correo la constancia de su acuerdo: qué espacios, en qué sede, desde cuándo y hasta cuándo. Y antes de firmar puede ver el mueble en 3D con su marca puesta, en una lámina de antes y después que se le manda adjunta.

### Los números que vas a tener a la vista

**Bajada del bloque:**

> No son promesas. Son las cifras que la pantalla le muestra cada vez que la abre.

| Cifra | Cómo se lee |
|---|---|
| **Ocupación** | `35 %` · 8 de 23 caras vendidas en el periodo |
| **Canon vigente** | lo que están pagando hoy los contratos vivos, al mes |
| **Sin alquilar** | cuánto vale a tarifa lo que está vacío, y cuánto es eso por día vacío |
| **Vence en 30 días** | cuántos espacios y cuánta plata se le caen si nadie los renueva |
| **Sin montar** | contratos ya cobrados que todavía no están armados en el piso |

**Línea de cierre del bloque:**

> Y un contrato de tres puntas de góndola se arma una vez, no tres.

*Intención: que el gerente se reconozca a él y a su gente; que entienda que darle acceso al mercaderista no le abre la caja; y que los beneficios se lean como cifras que él va a poder mirar, no como porcentajes de mejora inventados por un vendedor. La tabla es la prueba de que acá nadie promete «+30 % de ingresos».*

---

## 5. Cómo se usa

**Título de sección:**

> Cómo se arranca

**Bajada:**

> Tres pasos. El primero toma un minuto; el segundo es el trabajo de verdad y se hace una sola vez.

### Paso 1

**Número:** `1`
**Título:** `Cree la cuenta y su supermercado`
**Texto:**

> Entre con Google o con su correo, le pone nombre a su supermercado y queda como dueño de la cuenta. Después invite a su equipo: cada persona con su correo y con el permiso que le toca.

### Paso 2

**Número:** `2`
**Título:** `Dibujá el plano de cada sede`
**Texto:**

> Ponga los muebles como están en la sala y marque cuáles se alquilan. Las cajas y las columnas quedan de contexto, en gris. Si ya tiene los contratos de la temporada en un Excel, los carga de una vez: el sistema le muestra fila por fila qué entra y qué choca, antes de crear nada.

### Paso 3

**Número:** `3`
**Título:** `Vendé tocando el mapa`
**Texto:**

> Elija la temporada, mire qué quedó verde, toque el mueble y llene el contrato. Al guardar salen los tres correos y el espacio cambia de color en el plano.

**Nota bajo los tres pasos:**

> Cada supermercado empieza vacío. RECABRA no viene con datos de nadie adentro.

*Intención: bajarle el miedo al paso 2, que es el único que cuesta, y dejar claro que el paso 3 es el trabajo de todos los días. Si alguien lee estos tres pasos y piensa «esto lo puedo hacer un sábado», la sección funcionó.*

---

## 6. Asesoría

**Antetítulo:**

> Lo que ningún Excel le va a decir

**Título de sección:**

> Además del sistema, le decimos qué proponer

**Bajada:**

> Un sistema le muestra lo que pasó. Nosotros miramos sus números y le llevamos, por escrito, qué le puede ofrecer a quién esta semana.

### Bloque A

**Título:** `Recomendaciones ordenadas por lo que hay en juego`

**Texto:**

> Cada recomendación viene con un valor al lado y una razón. «Tiene tres puntas de góndola libres: ofrézcalas a $ 2.000.000 cada una, que es el promedio que usted mismo está cobrando por ese tipo — $ 6.000.000 en juego.» «El contrato de esa punta vence en 19 días: renuévelo o reasígnelo — $ 2.000.000 en juego.» Primero las de mayor valor.

### Bloque B

**Título:** `Oportunidades espacio por espacio`

**Texto:**

> Para cada mueble libre o que se libera en el periodo: un precio sugerido —el promedio que ya cobra por ese tipo, o el promedio de los supermercados que usan RECABRA si usted todavía no cobra ninguno— y hasta tres proveedores suyos que podrían tomarlo, empezando por los que ya alquilan ese mismo tipo de mueble.

### Bloque C

**Título:** `Tendencia mes a mes`

**Texto:**

> Ocupación, ingreso contratado y canon promedio, guardados mes a mes desde que entra. La pregunta «¿estamos mejorando?» deja de contestarse de memoria. Un mes sin datos aparece como un hueco, no como un cero: un cero sería mentira.

**Cierre honesto de la sección (va completo, no se recorta):**

> **Cómo funciona, sin vueltas.** Esta parte no es una pantalla suya: la revisa una persona de RECABRA sobre sus propios datos, y le llega en la sesión de asesoría. Todo lo que se lee está escrito en la Política de Tratamiento de Datos, queda anotado con la fecha y el correo de quien lo consultó, y puede pedir ese registro cuando quiera desde su propia cuenta.

**Enlace del cierre:** `Ver el reporte de transparencia` → `/politica-datos` (sección §5.3) o, para quien ya tiene sesión, `/reporte-plataforma`.

*Intención: este es el diferencial y hay que decirlo sin humo. El gerente tiene que entender dos cosas al mismo tiempo: (a) alguien mira sus números y le trae propuestas concretas con plata al lado, y (b) eso lo mira una persona, está declarado y él lo puede auditar. Ocultar (b) para que suene más automático sería exactamente lo que la Fase 7 decidió no hacer.*

---

## 7. Confianza

**Título de sección:**

> Dónde quedan sus datos

**Bajada:**

> Esto lo usa gente distinta de la misma tienda, y hay dinero adentro. Así está resuelto.

### Punto 1

**Título:** `Cada supermercado, en su propia base`
**Texto:**

> Los planos, los contratos y los proveedores de su supermercado viven en una base separada de la de cualquier otro cliente. No es un filtro por columna: es otra base.

### Punto 2

**Título:** `Cada persona entra con su cuenta`
**Texto:**

> Con Google o con correo y contraseña. Nada de una clave compartida que sigue funcionando cuando alguien se va. Desactivás a esa persona y pierde el acceso en el siguiente clic, sin tocar a nadie más.

### Punto 3

**Título:** `El dinero no le llega a quien no le toca`
**Texto:**

> Los valores no se ocultan en la pantalla: se borran en el servidor antes de mandarla. El mercaderista no tiene forma de verlos, ni siquiera mirando lo que le llegó al navegador.

### Punto 4

**Título:** `Puede auditar qué se mira de usted`
**Texto:**

> El dueño de la cuenta puede pedir, cuando quiera, el reporte de transparencia: qué datos toma RECABRA, cómo los calcula, de dónde salen, para qué, y quién los consultó y qué día. También puede descargar todos sus datos y pedir la supresión.

### Punto 5

**Título:** `Colombia, Ley 1581`
**Texto:**

> Tratamiento de datos personales conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013. La política es pública y se lee sin tener cuenta.

**Enlaces de la sección:**

- `Política de Tratamiento de Datos` → `/politica-datos`
- `Reporte de transparencia` → `/politica-datos#transparencia` (para quien no tiene sesión) · `/reporte-plataforma` (para el dueño de la cuenta)

*Intención: que el gerente que duda de meter la plata de su tienda en una página web encuentre respuestas concretas y verificables, no sellos ni escudos. Cada punto tiene que sonar a decisión de ingeniería tomada, no a promesa de marketing.*

---

## 8. Precio y modelo comercial

**Título de sección:**

> Cuánto cuesta

**Precio:**

> `[COMPLETAR: precio]` `[COMPLETAR: unidad — por supermercado al mes, por sede al mes, o lo que corresponda]`

**Cómo se paga:**

> Por transferencia bancaria, contra cuenta de cobro. No hay pasarela de pagos ni le pedimos una tarjeta.

**Qué pasa si un mes se atrasa (bloque de tres líneas):**

> - Primero le avisamos en la pantalla, y todo sigue funcionando igual.
> - Si el atraso sigue, la cuenta pasa a solo lectura: puede entrar, ver todo y consultar, pero no se cargan contratos nuevos.
> - Sus datos no se borran nunca. Ponga la cuenta al día y vuelve a trabajar donde lo dejó.

**Contacto:**

> ¿Tiene varias sedes o una cadena regional y quiere que lo veamos juntos? Escríbanos a `[COMPLETAR: correo de contacto]`.

**CTA de la sección:** `Hablemos` → `mailto:[COMPLETAR: correo de contacto]`

*Intención: que el precio no sea una emboscada y que la forma de pago local (transferencia + cuenta de cobro) se lea como normal y no como algo improvisado. El bloque del atraso es a propósito: contarlo antes de que pase es lo que hace que se crea el resto de la página.*

---

## 9. CTA final

**Título:**

> Empiece por una sede

**Texto:**

> Cree la cuenta, dibuje la tienda que más espacios vende y mire cuántos tiene libres esta temporada. Si sirve, siga con las demás.

**CTA primario** → `/login#registro`:

> Crear mi cuenta

**CTA secundario** → `/login`:

> Ya tengo cuenta

**Línea de cierre bajo los botones:**

> Entre con Google o con su correo. El plano de arriba es de ejemplo; el suyo lo dibuja usted.

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

> El plano de esta página es un supermercado inventado, sembrado en el código de la propia página. No corresponde a ningún cliente.

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

**Nota fija al pie de las tarjetas con proveedor y plata:**

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

> Es la misma lectura que va a tener adentro, con su propia tienda.

### 11.4 Estados vacíos y de error del plano

| Situación | Texto |
|---|---|
| El plano no pudo dibujarse | `No pudimos dibujar el plano de ejemplo. El resto de la página funciona igual.` |
| El plano no pudo dibujarse — acción | `Reintentar` |
| El 3D no pudo cargar | `No pudimos abrir la vista 3D en este dispositivo. El plano de arriba sigue disponible.` |
| El 3D no pudo cargar — acción | `Volver al plano` |
| El navegador no soporta la vista 3D | `Este navegador no puede mostrar la vista 3D. Adentro de RECABRA vas a poder abrirla desde un equipo de escritorio.` |
| `prefers-reduced-motion` activo, aviso opcional | `Animaciones reducidas, como lo pidió en su sistema.` |
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
| Ejemplo del total del plazo | `$ 1.500.000 al mes × 61 días = $ 3.050.000` | `docs/ESTADO.md`, «Cómo quedaron las dos pantallas» (el ejemplo del documento) |
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

No se alquilan y no llevan tarjeta con plata. Si el diseño les pone tarjeta, dice
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
