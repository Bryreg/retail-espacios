# E · La fusión

**Prototipo:** `index.html` — autocontenido, se abre con doble clic. Un solo archivo, sin librerías,
sin fuentes ni recursos externos, sin una sola llamada de red.

> «Me parece que está más completa la información en C, pero la interacción de A me hace querer
> comprarlo. Debemos encontrar un punto medio entre ambos.»

E es ese punto medio, y no es una mezcla de compromiso: es **la estructura de C con el gesto de A
concentrado donde vale**. La página tiene ocho secciones de largo normal y densidad de tablero;
la cámara sobre el plano vive en dos de ellas —el hero y «Lo que hace»— y en un momento corto de
«Cómo se arranca». El resto es estático, dense y se lee a la velocidad que quiera el lector.

---

## Qué tomé de A

1. **El hero completo.** La sala isométrica grande, viva desde el primer segundo, ocupando la mitad
   izquierda a sangre. Rueda, arrastre, pellizco, `+ / − / Centrar / Ver en 3D`, ficha al tocar,
   teclado completo (flechas, `+`, `−`, `Enter`, `Esc`) y tabla equivalente.
2. **La cámara guiada por scroll**, con interpolación (lerp 0,14) sobre un solo `transform`: el
   objeto que mirás no cambia nunca, cambia tu punto de vista. Está acotada al film (hero + «Lo que
   hace»): nueve encuadres, no veinticuatro.
3. **Las capas de prueba sobre el propio plano**, ancladas al mueble del que habla la tarjeta:
   la ficha del contrato sobre `PUN-01` con el total de `$ 3.050.000`, el `−17 %` sobre `GON-04·A`,
   la tira de las nueve temporadas mientras el plano se repinta, los tres correos sobre la línea
   30 / 15 / 6, y el celular del montaje sobre `CRS-01`.
4. **Las dos caras de la góndola se separan** en el bloque 1: `GON-04·A` (tomada) y `GON-04·B`
   (libre) se apartan del núcleo gris con sus códigos a la vista. Es el momento en que se entiende
   el modelo del producto sin leer una línea.
5. **El momento de «Cómo se arranca»**, en versión corta: **una sola pantalla pegada** donde la sala
   se vacía (paso 1), se redibuja en gris pieza por pieza (paso 2) y se pinta con los 16 alquilables
   (paso 3), con el rótulo cambiando —«Cuenta creada · sala vacía» → «Dibujando la sala · todo en
   gris» → «16 espacios alquilables, pintados»—. Ocupa 220 vh en lugar de las tres pantallas
   completas de A.
6. **La estética.** Fondo oscuro profundo (`#04070A`), sala a media luz, **amarillo de etiqueta de
   precio como único color de acción** (botones, plata, números de sección, señal), display de
   sistema con peso 800 y tracking negativo para los titulares, y monoespaciada con cifras tabulares
   para códigos, plata y fechas.

## Qué tomé de C

1. **La estructura y la densidad.** Ocho secciones (hero, lo que hace, para quién, cómo se arranca,
   asesoría, datos, precio, cierre) más el pie. Ninguna es una pantalla vacía con una frase.
2. **Las seis microdemos de «Lo que hace»**, dentro de las tarjetas y funcionando solas: el mini
   plano que morfa 2D ↔ 3D al pasar el mouse, la ficha del contrato que **suma** hasta
   `$ 3.050.000`, el medidor con el `−17 % vs referencia`, el selector de temporada que **repinta**
   los 16 espacios, los tres correos escalonados sobre la línea 30 / 15 / 6, y el celular que
   **exige la foto** (con aviso al confirmar).
3. **Los conectores entre secciones que nombran el título literal de la siguiente** (`02 · Tres
   personas usan esto, y cada una ve otra cosa`, `03 · Cómo se arranca`, …). No inventan una sola
   frase de copy.
4. **Los contadores de cifras verificadas:** 7 / 3 / 6 en la barra superior y en la leyenda, el
   35 % del anillo de ocupación, el total del plazo, los 30 / 15 / 6 días.
5. **El resto del tablero:** la barra superior con navegación viva y progreso, el conmutador de los
   tres permisos con la plata **tachada** para el mercaderista, la lectura de cifras, la tira de
   meses con el hueco punteado en abril, la cadena de estados de la cuenta en «Cuánto cuesta», y las
   ranuras `[COMPLETAR: …]` como huecos visibles del tablero.
6. **La accesibilidad y las paletas validadas.** Los cuatro estados usan la paleta que C pasó por el
   validador de `dataviz` (oscuro `#00BE86 · #F5A524 · #F4544E`; claro `#00805A · #CE8A0A ·
   #D8342E`). Cada mueble alquilable es un `role="button"` con `tabindex` y nombre accesible; el
   contenedor tiene `aria-label` + `aria-describedby`; hay tabla equivalente en un `<details>`;
   `role="tablist"` en los perfiles; `aria-pressed` en herramientas y chips; `aria-live` en la ficha;
   y **el estado siempre lleva la palabra al lado del punto de color**.
7. **El vidrio moderado y apagado bajo 720 px** para no hundir los fps en un Android de gama media.

## Qué dejé afuera, y por qué

| Qué | De dónde | Por qué |
|---|---|---|
| Las 24 pantallas de A | A | Es el motivo exacto del reparo. E tiene 16 pantallas: 6 son el film (hero + las seis tarjetas), 2 el momento de los pasos, y las demás son secciones normales. |
| El riel de capítulos flotante (los puntitos de la derecha) | A | Con ocho secciones y navegación arriba, sobraba; era chrome de una página de 24 paneles. |
| Las escenas de A para «asesoría», «tus datos» y «los números» (etiquetas de plata sobre los libres, las dos bases que se separan, las cifras flotando) | A | Ahí la información de C es mejor y más honesta en estático. Meter cámara en cinco secciones más devolvía la página a las 24 pantallas. |
| La sparkline de tendencia de A | A | El copy §12 prohíbe graficar lo que no está verificado; C ya resolvió eso con la tira de meses y el hueco punteado. Se quedó la de C. |
| El azul señal de C (`#4E8DF5`) y el violeta | C | La consigna pide la estética de A: un solo color de acción, el amarillo de etiqueta de precio. Todo lo que en C era azul acá es amarillo. |
| El marco de dispositivo alrededor del plano de C | C | El hero de A pide el plano a sangre, no dentro de una ventanita. Los controles y la leyenda quedaron flotando sobre el plano, como en A. |
| El gancho de texto entre el hero y «Lo que hace» | C | Acá el conector es el plano mismo: la cámara ya está viajando cuando llega la primera tarjeta. Los conectores con título literal siguen estando entre las secciones 02 y 07. |
| La ficha abierta y el arrastre de un dedo sobre el plano pegado, en móvil | — | En móvil el plano queda pegado arriba: un dedo **siempre scrollea la página** (`touch-action: pan-y`), el pellizco acerca y los botones `+ / − / Centrar` son la alternativa que exige la WCAG 2.2. Si el plano se tragara el dedo, la página se sentiría trabada. |

## Lo que es nuevo en E (y no estaba ni en A ni en C)

- **Titular.** `Vendé tocando el plano`, con el titular viejo bajado intacto a subtítulo:
  «Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo.» **El recurso de pintar las
  palabras con los colores del estado se mantiene, pero mudado al subtítulo**, que es donde el texto
  nuevo lo permite de forma natural: *libre* verde, *ocupa* rojo, *a cuánto* amarillo señal,
  *hasta cuándo* naranja. El H1 va en un solo color, a peso completo. Así la leyenda se enseña
  igual, antes de leerla, y el titular no queda arlequinado con cuatro palabras.
- **Una sola proyección con parámetro** para el plano: `Ver en 3D` no dibuja otra escena, mueve un
  parámetro que baja el horizonte (seno 0,50 → 0,30) y sube los muebles (× 1,9), interpolado en
  760 ms. Es la idea de C aplicada al gesto de A.
- **El oscuro es el modo de la casa.** Sin preferencia guardada, la página arranca oscura (es la
  estética que se está proponiendo); el claro está entero y a un clic, y queda recordado en
  `localStorage`. A y C seguían la preferencia del sistema, y eso hacía que la mitad de la gente
  nunca viera la dirección que se le estaba mostrando.
- **Movimiento reducido = cámara quieta, no cámara apagada.** Con `prefers-reduced-motion` la cámara
  **sigue cambiando de encuadre** con el scroll, pero de golpe, sin recorrido; las capas de prueba
  aparecen igual (nada de `display:none`, que era el punto flojo de A); los contadores muestran el
  valor final; y «Cómo se arranca» deja de ser pantalla pegada y se lee como tres pasos con la sala
  ya dibujada y pintada. **Nadie pierde una sola prueba visual.**
- **En pantallas chicas** el plano se pega arriba (40 dvh) y las tarjetas pasan por debajo; las capas
  sobre el plano se apagan y **la prueba la dan las microdemos de cada tarjeta**, que ahí son más
  legibles. «Cómo se arranca» tampoco usa pantalla pegada: la sala se vacía, se dibuja y se pinta
  sola al entrar en cuadro.

## Cómo está hecho (para el port a React)

- **Los datos del plano** son la constante `PIEZAS`: 45 piezas, 16 alquilables (10 CENTRO, 6 PALMAS)
  y 29 de contexto gris — el gris es mayoría, como pide `copy.md` §13.1. Reparto 7 libres / 3 se
  liberan / 6 tomados. Cambiar `MercaFresco`, los proveedores o los valores es tocar una constante.
- **La cámara es estado derivado del scroll, no del render.** `cam` y `tgt` viven fuera de React;
  cada cuadro escribe un único `transform` sobre `<g id="escena">`. En React: `useRef` y escritura
  imperativa. **No** poner la cámara en `useState` (serían 60 renders del árbol por segundo).
- **Los rótulos del plano tienen tamaño constante en pantalla**: el `<g>` publica `--lbl` y `--sede`
  en píxeles divididos por la escala vigente, así los códigos no se agrandan al acercar.
- **Nada de `setPointerCapture` en el contenedor del plano.** Capturar el puntero ahí le roba el
  click a los botones y a la ficha que viven encima; el arrastre se sigue con eventos de ventana.
  (Es una trampa real: se pierde en silencio, sin error en consola.)
- **El plano se construye en el primer `requestAnimationFrame` después de `DOMContentLoaded`**: el
  H1 y los botones son HTML estático y pintan antes. Si la construcción falla, aparece el texto de
  error de `copy.md` §11.4 con su botón «Reintentar».
- **Tokens** en tres capas (primitivo → semántico → componente) en `:root` y `[data-theme]`. Chocan
  con los `--con-*` de la app: prefijar (`--lp-*`) y montar la landing en su propio ámbito, o decidir
  que la app adopte esta paleta. Es deuda, no diseño, y la decisión es del dueño.
- **Copy literal** de `copy.md` y en su orden, salvo el H1 y el subtítulo nuevos. Un `h1`, siete
  `h2`, los siete `[COMPLETAR: …]` a la vista. Si un texto no entra, se pide el recorte en
  `copy.md`; no se reescribe en el `.tsx`.

## Verificado en el prototipo

- 360 / 768 / 1024 / 1440 / 1920 px: **cero desborde horizontal**, cero errores de consola.
- Claro y oscuro, con el interruptor y con el tema recordado; el isométrico se repinta al cambiar.
- `prefers-reduced-motion`: cámara quieta, pruebas visibles, pasos legibles.
- Toque real (tap, pellizco, scroll con un dedo sobre el plano) y teclado (Tab a un mueble, `Enter`,
  `Esc`, flechas, `+`, `−`).
- 16 filas en la tabla equivalente; contadores 7 / 3 / 6 coherentes con la leyenda, con la barra
  superior y con la descripción larga del plano.

---

## Los tres puntos donde podés mover el dial

### 1. Cuánto dura el film — hacia A o hacia C

Hoy el hero y «Lo que hace» ocupan 6,3 pantallas de las 16 de la página: seis tarjetas con seis
encuadres de cámara. **Hacia A:** subir las tarjetas a pantalla completa y agregar encuadres para
«asesoría» y «tus datos» (la página se va a ~20 pantallas y la demo en vivo se vuelve imbatible;
quien entra a buscar el precio sufre). **Hacia C:** sacar la cámara de las tarjetas 4, 5 y 6 y
dejarlas como bento estático debajo del plano —el film baja a 3 pantallas y la página a ~12—.
Es un cambio de tres líneas en el mapa de escenas (`ESC`), no una reescritura.

### 2. Qué tan lejos llega la cámara sobre cada mueble

Los acercamientos están hoy en 1,7×–1,95× sobre el encuadre general: se sigue viendo que eso es una
tienda. **Hacia A:** subirlos a 2,4×–2,6× (como estaban en el primer corte) hace que el mueble llene
la pantalla y el momento sea más cinematográfico, pero a ese zoom los muebles se leen como bloques
abstractos y se pierde el contexto de sala. **Hacia C:** bajarlos a 1,2×–1,4× deja siempre la sede
entera a la vista y la página se siente más «tablero» que «película». Es el número `z` de cada
escena.

### 3. El amarillo de acción contra el naranja de «se libera»

La estética de A pide un único color de acción y ese color es el amarillo de etiqueta de precio
(`#FFD028`). La paleta validada de C pone «se libera» en ámbar (`#F5A524` en oscuro, `#CE8A0A` en
claro). **Son vecinos**, y se tocan en dos lugares: el subtítulo del hero (*a cuánto* amarillo,
*hasta cuándo* ámbar) y la leyenda junto a los botones. Se sostiene porque el estado **siempre**
lleva la palabra escrita al lado, que es la regla del producto. Tres salidas:
**(a)** dejarlo como está y asumir la vecindad; **(b)** hacia A: cambiar «se libera» al naranja de A
(`#FF9A46`), que separa muchísimo más del amarillo pero sale de la paleta que C validó con el
validador de contraste y CVD; **(c)** hacia C: mover el color de acción del amarillo a otra cosa
—verde señal o azul— y perder el «amarillo de etiqueta de precio», que es justo lo que le da a esta
página el aire de góndola. Yo elegí (a) y lo dejo anotado; la decisión de si el naranja se toca es
del dueño, porque arrastra la auditoría de contraste.

**Un cuarto, más chico, por si aparece:** en modo claro el naranja «se libera» queda en 2,82:1 sobre
el papel. Viene declarado de C, se sostiene con la palabra al lado y con la tabla equivalente, pero
es el punto que un auditor va a marcar primero.
