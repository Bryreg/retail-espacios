# Las cuatro landings, comparadas

Para el dueño. Cuatro prototipos del mismo copy, en el mismo orden. Ninguno se tocó para escribir esto.

**Cómo mirarlos.** Abrí los cuatro `index.html` con doble clic y hacé siempre las mismas tres pruebas:
tocá y arrastrá el plano del hero, apretá el interruptor claro/oscuro, y volvé a abrirlos en el celular.
Las capturas van a favorecer a C y a D; el celular va a favorecer a B; el scroll largo solo se siente en A.

**Lo que las cuatro ya tienen resuelto** (verificado en el código, no en el README): un solo archivo, cero
recursos externos, cero llamadas de red, cero fuentes descargadas; el copy literal y en orden, con un `h1`,
siete `h2` y los `[COMPLETAR: …]` a la vista; plano isométrico propio sin librerías con zoom, arrastre,
ficha, teclado y tabla equivalente en `<details>`; el estado siempre con la palabra al lado del color;
claro/oscuro con interruptor y `prefers-reduced-motion` contemplado. **En ninguna de las cuatro el
«Ver en 3D» es three.js**: las cuatro lo resuelven interpolando la misma geometría. Eso significa que la
decisión no es técnica de base — las cuatro parten del mismo piso. Se decide por **tono, por largo y por
cuánto cuesta sostenerla en React**.

| | Peso | JS | Secciones | Costo de port | Tono | Riesgo principal |
|---|---|---|---|---|---|---|
| **A** Piso en vivo | 87 KB | 26 KB | 24 pantallas | **Alto** | Cine, oscuro | Largo y frágil de mantener |
| **B** Góndola | 91 KB | 22 KB | 8 | **Bajo** | Cartel de oferta | Depende de una fuente que no trae |
| **C** Tablero | 124 KB | 34 KB | 8 | Medio-alto | SaaS técnico | Se parece a todas las demás |
| **D** Mercado | 107 KB | 24 KB | 8 | Medio-bajo | Cálido, ilustrado | Se ve mejor en Apple que en el resto |

---

## A · El piso en vivo

- **Qué propone.** No hay ilustraciones por sección: hay una sola sala isométrica pegada a la pantalla de
  punta a punta, y lo que se mueve al bajar es la cámara sobre ese mismo plano.
- **Dónde engancha de verdad.** Es la única que no se puede resumir en una captura, y eso es exactamente su
  argumento. El mejor gancho de las cuatro está acá: antes del paso 1 la sala **se vacía**, y hay que seguir
  bajando para verla volver a dibujarse en gris y después pintarse. Cortar el scroll cuesta.
- **Dónde no.** Son **24 paneles de pantalla completa**: unas tres veces el largo de una landing normal.
  Quien entra a buscar el precio tiene que bajar mucho o usar el menú. Y hay que decirlo: buena parte de las
  «demostraciones» (la ficha del contrato, los tres correos, el celular, el 35 %, la tendencia) son tarjetas
  flotando **sobre** el plano, no el plano; lo que sí es el plano de verdad es el repintado por temporada y
  el vaciado de los pasos.
- **Riesgo en React.** El más caro de los cuatro. Cámara escrita por `ref` en cada frame, nueve capas de
  efecto sincronizadas con el scroll, y tarjetas con vidrio (`blur 18px`) encima de un SVG que se está
  transformando — **sin apagado en móvil**, que es justo lo que hunde los fps en un Android de gama media.
  Además sus secciones no se pueden reordenar sin recalcular la cámara: cada cambio de copy es trabajo de
  frontend, no de texto.
- **Accesibilidad.** Con `prefers-reduced-motion` las nueve capas se ocultan (`display:none`). No se pierde
  información —el copy la dice igual— pero esa persona se queda **sin ninguna prueba visual**. Habría que
  decidir si eso se acepta o si se dibuja una versión quieta de esas capas.
- **A quién le habla.** Gerente de cadena o inversionista al que le vas a mostrar la pantalla vos mismo. No
  al que llegó de Google buscando cuánto sale.

## B · Góndola (cartel de supermercado)

- **Qué propone.** La página es una tienda y se recorre como una: seis pasillos numerados con cabecera
  colgante, señalética de oferta, la plata compuesta como etiqueta de precio y un cartel colgante que
  pregunta lo que la sección de abajo contesta.
- **Dónde engancha de verdad.** Es la más rápida de leer y la más fácil de recordar. El fondo entero cambia
  en cada pasillo, así que el avance se siente sin necesidad de scroll cinematográfico. Y los colgantes son
  **botones**: el que no quiere leer, salta. Respeta al lector apurado, que es la mayoría.
- **Dónde no.** Es la más lejana de «software serio». Lo mismo que la hace memorable puede hacer que un
  comprador de cadena grande dude del precio del producto. Hay además una incomodidad: pone los precios como
  titular gigante en una página cuyo propio precio todavía dice `[COMPLETAR]`.
- **Riesgo en React.** El más barato de construir: ocho secciones normales, `IntersectionObserver`, cero
  vidrio, cero cámara. Pero **su identidad depende de una tipografía condensada que no viene empaquetada**
  (Avenir Next Condensed → Roboto Condensed → Arial Narrow → Impact → system-ui). En Android y en buena parte
  de Linux no hay ninguna condensada instalada: la página cae a la fuente del sistema en versales y pierde
  precisamente lo que la hace ser B. Si se elige, hay que empaquetar una fuente local y tocar la CSP.
- **Accesibilidad.** Los bloques planos con borde grueso ayudan mucho. Hay que auditar el texto sobre
  amarillo y sobre el rojo a sangre del cierre, y medir cuánto alto útil comen en el celular la barra
  superior más la cabecera de pasillo pegajosa.
- **A quién le habla.** Dueño de supermercado independiente, de una a cinco sedes, que vive en el piso de
  venta. Ese la entiende en cinco segundos y sin explicación.

## C · El tablero encendido

- **Qué propone.** La landing no habla del software: **es** el software. Tablero oscuro, paneles de vidrio,
  grilla bento asimétrica, y cada bloque de «Lo que hace» con una microdemo funcionando.
- **Dónde engancha de verdad.** Es la que más rápido convierte «curioso» en «esto ya existe». Las microdemos
  (la ficha que suma, el −17 %, el selector de temporada que repinta, el teléfono que exige foto) son la
  prueba más concreta de las cuatro. Y los conectores entre secciones usan el **título literal** de la
  sección siguiente: gancho gratis, sin inventar una sola frase.
- **Dónde no.** Es la más genérica. Sacale el plano y es cualquier landing de SaaS oscuro: vidrio, retícula,
  azul señal. El rechazo anterior fue «no me mantiene enganchado»; C arregla el enganche pero no cambia el
  registro, así que no resuelve el problema de fondo de parecerse a todo lo demás.
- **Riesgo en React.** Alto en cantidad, no en dificultad: doce componentes, seis observers, catorce usos de
  vidrio (ya apagados bajo 720 px, bien hecho) y el morfeo 2D↔3D por un parámetro. El riesgo real lo declara
  su propio autor: **sus tokens chocan con los `--con-*` de la app**. Hay que prefijarlos y decidir si la app
  termina adoptando esta paleta. Eso es deuda, no diseño, y la decisión es tuya.
- **Accesibilidad.** La más trabajada de las cuatro (17 `aria-label`, 12 `role`, dos paletas de estado
  validadas por separado). Con una salvedad ya declarada: en modo claro el naranja «se libera» queda en
  2,82:1 sobre el papel; se sostiene porque la palabra siempre acompaña al punto, pero es el punto que un
  auditor va a marcar.
- **A quién le habla.** Gerente de cadena mediana, o comprador que le va a reenviar esto a un jefe. Es la que
  mejor aguanta viajar sola como captura en un correo.

## D · El mercado

- **Qué propone.** Un día completo en la tienda, de 7:40 a. m. a 8:00 p. m. Cada sección tiene su hora y la
  luz de la página avanza con ella, hasta un atardecer literal y un cierre de noche. Ilustración vectorial
  propia (19 símbolos, 16 KB) con las tres personas del producto dibujadas de verdad.
- **Dónde engancha de verdad.** Es la única con calidez y con gente adentro. El día que avanza da sensación
  de progreso **sin** scrollytelling, no pesa nada y sobrevive a una captura. Los ganchos son preguntas de
  negocio («¿cuánto cuesta llegar hasta acá desde cero, un lunes cualquiera?»), no flechas decorativas.
- **Dónde no.** La hora es una convención: si el lector no la compra, son rótulos de más. Y el registro
  amable puede leerse como «producto chico» frente a una cadena grande. El estilo redondeado depende de
  `ui-rounded` / SF Pro Rounded: en Mac y iPhone se ve exactamente como fue pensado, en Windows y Android
  cae en Segoe/Roboto y pierde parte del encanto — mismo problema que B, bastante más leve.
- **Riesgo en React.** Medio-bajo: ocho secciones, cuatro observers, un solo uso de vidrio, la cámara del
  plano por `ref`. Lo que hay que sostener son las ilustraciones: los 19 símbolos llevan el color **en
  hexadecimal adentro** (a propósito), así que cualquier cambio de paleta se hace en dos lugares. Su README
  lista cuatro trampas de CSS ya resueltas que se van a reintroducir solas si el port lo hace alguien que no
  lo lea.
- **Accesibilidad.** El mejor rotulado del grupo (26 `aria-label`) y la tabla de cifras se apila bien en
  360 px. Un detalle a mirar en el celular: el plano usa `touch-action:none`, así que **un dedo sobre el
  plano no scrollea la página** (es deliberado y coherente con «Deslizá para moverte», pero es lo que más se
  puede sentir como que la página se trabó). A resuelve lo mismo al revés y deja que el dedo scrollee.
- **A quién le habla.** Supermercado independiente y familiar; en general, al que hoy lleva esto en un chat
  de WhatsApp. Es la que menos suena a proveedor de software.

---

## Recomendación

**Base D, con dos préstamos, y A como página aparte.** No es una mezcla de compromiso: es lo que sale de
mirar a quién le vendés la primera cuenta.

1. **D de base.** El tono es el correcto para un supermercado independiente, es la única con personas
   dibujadas, y es barata de construir y de editar. El día que avanza resuelve el enganche sin hipotecar el
   frontend.
2. **De C, robale dos cosas concretas.** Los **conectores que nombran el título literal de la sección
   siguiente** (es el mejor mecanismo de gancho de las cuatro, no inventa copy, y se implementa en una
   tarde), y las **microdemos** en «Lo que hace»: hoy D pone ahí medallones ilustrados, y una ilustración
   explica menos que una ficha que suma sola.
3. **De A, robale un solo momento.** El plano que **se vacía, se redibuja en gris y se pinta** en los tres
   pasos de «Cómo se arranca». Es el gancho más fuerte del lote y no exige convertir la página entera en
   scrollytelling: es una sección, no una arquitectura.
4. **De B, robale la composición de la plata**: los precios como titular (`$ 1.500.000 × 61 días =
   $ 3.050.000`, `−17 % vs referencia`). Funciona en cualquiera de las cuatro y cuesta cero.
5. **A no como landing.** Es la más impresionante y la más cara: 24 pantallas, secciones que no se pueden
   mover sin tocar la cámara, y la prueba visual apagada para quien pide menos movimiento. Si te gusta —y es
   la que más te va a gustar en la demo— vive mejor como una página aparte (`/como-funciona`) a la que la
   landing manda, no como la puerta de entrada.
6. **Si el cliente objetivo resulta ser cadena y no independiente, la base cambia a C** y D pasa a ser el
   préstamo (las tres personas dibujadas, para sacarle a C lo genérico). Es la única variable que da vuelta
   toda la decisión, y es la primera pregunta de abajo.

**Lo que no recomiendo:** B como base tal cual está. Es la más simpática y la más barata, pero su identidad
descansa en una fuente que no trae, y poner el precio como titular gigante mientras el precio real dice
`[COMPLETAR]` es la clase de detalle que se publica por accidente.

---

## Tres preguntas que tenés que contestar vos

1. **¿A quién le vendés la primera cuenta: al dueño de un independiente de una a tres sedes, o al gerente de
   una cadena de diez o más?** No se puede optimizar para los dos con la misma página. Independiente → D (o
   B). Cadena → C. Es la pregunta que decide, y las demás son detalle.
2. **¿Cada cuánto se va a tocar esta página, y quién la va a tocar?** Si el precio, una sección o un ejemplo
   nuevo van a entrar varias veces al año, y si los va a editar alguien que no es el frontend, **A queda
   descartada como base**: sus secciones están amarradas al recorrido de la cámara. Si la página se publica y
   se toca dos veces al año, A vuelve a la mesa.
3. **¿Hay permiso para empaquetar una fuente local y tocar la CSP de Fase 3?** Si la respuesta es no, B
   pierde su identidad fuera de Mac y de algunos Android, y D se degrada un poco en Windows. Con un no, la
   elección se estrecha a las dos que se ven igual en todas partes (A y C); con un sí, B y D se sostienen
   como fueron diseñadas.
