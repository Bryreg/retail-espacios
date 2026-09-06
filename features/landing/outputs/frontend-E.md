# Frontend · la landing re-vestida a la dirección E

El dueño eligió **E · «La fusión»**
(`features/landing/outputs/opciones/E-fusion/index.html`). La landing que ya
vivía en la aplicación —«Planta y tinta», papel cálido y ultramar— quedó
reemplazada de arriba abajo. Lo funcional que ya andaba se conservó entero: el
plano interactivo con teclado y tabla equivalente, el `Vista3D` perezoso de
three.js, el conmutador de tema, el límite de error y las tres reglas duras de
la página pública (cero `/api/*`, cero recursos externos, todo el CSS bajo
`.lp`).

Este documento dice, en orden: **qué se portó tal cual**, **qué se adaptó** y
**qué quedó distinto de E, y por qué**.

---

## Archivos

| Archivo | Qué pasó |
|---|---|
| `frontend/src/pages/Landing/datos.ts` | Reescrito con la constante `PIEZAS` de E (45 piezas, 16 alquilables, 29 de contexto). |
| `frontend/src/pages/Landing/motor.ts` | **Nuevo.** La proyección con parámetro, las tres caras del prisma, la caja envolvente y el lector de paleta. Funciones puras: no toca el DOM ni React. |
| `frontend/src/pages/Landing/PlanoIsometrico.tsx` | Reescrito: la sala pegada, la cámara por escenas, las capas de prueba, la ficha, el HUD, la tabla equivalente. |
| `frontend/src/pages/Landing/Miniaturas.tsx` | **Nuevo.** La miniatura que morfa 2D ↔ 3D de la tarjeta 01 y la sala de «Cómo se arranca». |
| `frontend/src/pages/Landing/Landing.tsx` | Reescrito: ocho secciones, barra superior, conectores, microdemos, contadores. |
| `frontend/src/pages/Landing/landing.css` | Reescrito desde el CSS de E, con todos los selectores colgando de `.lp`. |
| `frontend/src/pages/Landing/Vista3D.tsx` | Sólo la paleta (ahora la de E) y el rótulo del botón que lo abre. El motor 3D no se tocó. |
| `frontend/scripts/probar-landing.mjs` | Dos asserts actualizados (ver «Tests»). |
| `docs/ESTADO.md` | Subsección nueva: «Landing — re-vestido a la dirección E». |

`src/App.tsx` **no se tocó**: las rutas, el deep link de montaje, `/login`,
`/politica-datos` y la redirección de quien ya tiene sesión siguen exactamente
como estaban.

---

## Lo que se portó tal cual

**Los datos.** `PIEZAS` de E, pieza por pieza, con las mismas coordenadas,
medidas, estados, proveedores, cánones y fechas; el mismo reparto 7 libres / 3
que se liberan / 6 tomados; las dos sedes con su desplazamiento; las dos caras
`GON-04·A` / `GON-04·B` adyacentes para que la separación del bloque 1 tenga
sentido geométrico.

**El motor del plano.** Una sola proyección con parámetro
(`proy(x, y, z, v)`, seno 0,50 → 0,30 y muebles × 1,9), las tres caras por
prisma, el orden del pintor por `x + y`, la paleta leída del CSS y mezclada con
el fondo para las caras clara y oscura. El motor de la app anterior (isometría
2:1 con `viewBox` fijo y zoom en unidades de usuario) **no daba para la cámara
por escenas**: los encuadres de E se calculan en píxeles contra la caja real
del plano y necesitan `base0`/`base1` para mezclar el encuadre 2D con el 3D.
Se portó el de E, como autorizaba la consigna.

**La cámara guiada por scroll.** El mapa `ESC` con los nueve encuadres y sus
`z` (0,55 a 1,95), el lerp 0,14 sobre un único `transform`, el ancla vertical a
0,60 de la altura cuando el encuadre es sobre un mueble, y el arranque del hero
desde 0,88× para que la sala «entre» en el primer segundo.

**Las capas de prueba** (`fxCaras`, `fxContrato`, `fxTemporada`, `fxTarifa`,
`fxAvisos`, `fxMontaje`), ancladas al mueble del que habla la tarjeta con sus
mismos `dx`/`dy`, con el mismo texto y las mismas cifras
(`$ 3.050.000`, `−17 %`, 30/15/6).

**La separación de las dos caras** de la góndola (± 1,15 m, 520 ms, con los
códigos a la vista) y el **repintado por temporada** con el mismo `hash` de E,
las nueve temporadas del calendario y la temporada 6 como estado de origen.

**Las trampas que E dejó anotadas**, respetadas al pie:
- **nada de `setPointerCapture`** en el contenedor del plano — el arrastre se
  sigue con eventos de ventana (la versión anterior de la app **sí** capturaba
  el puntero; con el HUD y la ficha encima de la sala eso le habría robado el
  clic a los botones, en silencio);
- **la rueda se arma con el primer clic o foco** sobre el plano, así que un
  plano pegado a pantalla completa nunca secuestra el scroll de la página;
- **los rótulos con tamaño constante en pantalla** (`--lbl` y `--sede` en
  píxeles divididos por la escala);
- **la cámara fuera de React**: `cam`, `tgt`, `base` y `V` viven en `useRef` y
  cada cuadro escribe un solo `transform`. Nada de `useState` por cuadro.

**Las seis microdemos**, funcionando: el mini plano que morfa 2D ↔ 3D al entrar
a la tarjeta (también con el foco), la ficha del contrato que suma hasta
`$ 3.050.000`, los cuatro chips de temporada que repintan los 16 espacios en
cascada, el medidor con el `−17 % vs referencia`, los tres correos escalonados
sobre la línea 30 / 15 / 6, y el celular que **exige la foto** con su aviso al
confirmar.

**El momento de «Cómo se arranca»**: 220 vh de pantalla pegada donde la sala se
vacía, se redibuja en gris pieza por pieza y se pinta con los 16 alquilables,
con el rótulo cambiando y los tres pasos encendiéndose. En pantallas chicas y
con movimiento reducido no hay pantalla pegada: la secuencia se juega sola al
entrar en cuadro (o queda dibujada y pintada, con movimiento reducido).

**El resto del tablero**: barra superior con navegación viva y progreso, los
contadores 7/3/6, el conmutador de los tres perfiles con la plata **tachada**
para el mercaderista, el anillo del 35 %, la tira de meses con el hueco
punteado en abril, la cadena de estados de la cuenta, los conectores que
nombran el título literal de la sección siguiente, las ranuras `[COMPLETAR: …]`
como huecos visibles y el pie entero.

**La estética**: fondo `#04070A`, amarillo de etiqueta `#FFD028` como único
color de acción, display de sistema 800 con tracking negativo, monoespaciada
con cifras tabulares, vidrio moderado y **apagado bajo 720 px**, oscuro por
defecto con el claro entero a un clic y recordado.

**El copy**, literal de `copy.md` y en su orden, con el H1 «Recabrá cada
metro.» y el subtítulo de E, con sus cuatro palabras pintadas con los colores
del estado. Un `h1`, siete `h2`, los siete `[COMPLETAR: …]`.

---

## Lo que se adaptó a React

1. **`innerHTML` → JSX.** E arma la ficha del mueble, el icono del tema y el
   texto de error con `innerHTML`. Acá la ficha es un componente con estado
   (`activo = {i, fijo}`) y el resto es JSX. No es cosmética:
   `test_landing_ataques.py` §L04 falla si aparece `dangerouslySetInnerHTML` o
   `.innerHTML =` en la landing.
2. **`document.getElementById` → refs.** Las capas de prueba, los chips de
   temporada, los suelos, las 45 piezas y la barra de progreso se escriben por
   `ref`, no por búsqueda en el documento. La única consulta al DOM que quedó
   es la del guion (`.panel[data-scene]`), acotada a la raíz `.lp`, porque los
   paneles los pinta `Landing.tsx` y el plano vive en otro componente.
3. **Los `<g>` de las piezas se pintan de forma imperativa.** El árbol se monta
   una vez (45 grupos de tres polígonos, un anillo y un rótulo) y `pintar()`
   escribe `points` y `fill`. Es lo que hace que morfar a 3D o separar las
   caras cueste un `setAttribute` por cara y no un render de React.
4. **`body.reducido` / `body.coarse` / `body.plan-focus` → atributos de la
   raíz de la landing** (`data-reducido`, `data-coarse`, `data-kb`): la landing
   no puede escribir clases en el `<body>`, que es de la aplicación.
5. **Los tokens de E (`:root[data-theme]`) → `.lp[data-lp-tema]`.** Es la deuda
   que el README de E anticipaba: `--bg`, `--panel`, `--fg` chocan con los de
   `src/index.css`. Se resolvió montando la landing en su propio ámbito (que es
   la salida que E proponía y la que `probar-landing.mjs` ya exigía), no
   renombrando los tokens ni cambiando la paleta de la aplicación. La decisión
   de si la app adopta esta paleta sigue siendo del dueño.
6. **Los contadores arrancan con la cifra final en el HTML**, y la animación la
   baja a cero y la vuelve a subir cuando entra en cuadro. E los sirve en `0` y
   los sube con JS: sin JavaScript —o en el render de servidor con el que
   `probar-landing.mjs` audita la página— eso deja un `$ 0` escrito donde tiene
   que decir `$ 3.050.000`.
7. **La paleta se relee al cambiar de tema** con un `MutationObserver` sobre
   `data-lp-tema` (E lo hacía dentro del propio manejador del botón, que acá
   vive en otro componente). El plano, la miniatura y la sala se repintan solos.
8. **El límite de error** de la app se conservó y ahora devuelve el texto de
   `copy.md` §11.4 con su botón «Reintentar», que es lo que E hace en su
   `catch`. Rinde un `Fragment` y no un `<div>`: el `.stage` tiene que seguir
   siendo hijo directo de `.film` o el `position: sticky` deja de pegar.

---

## Lo que quedó distinto de E, y por qué

1. **«Ver en 3D» conserva el gesto de E y además abre el 3D de verdad.**
   En E, «Ver en 3D» es un parámetro de la misma proyección. Acá el botón hace
   exactamente eso —y con la misma etiqueta, el mismo `aria-pressed` y los
   mismos 760 ms—, pero **dentro de esa vista aparece un botón más,
   «Recorrerla»**, que carga `Vista3D` (three.js) con `import()` y muestra la
   sala en perspectiva real.
   *Por qué:* el guardrail de la fase dice «three.js sólo bajo demanda para
   “Ver en 3D”, en chunk separado» y el copy promete que «la misma tienda se
   recorre en 3D»; borrar `Vista3D` habría tirado una función construida y una
   promesa del copy, y meter three.js en el botón principal habría cambiado un
   morph de coste cero por una descarga. El botón extra sólo existe cuando ya
   estás en 3D, así que quien no lo pide **no baja un byte de three**. Es la
   única pieza de interfaz que E no tiene.
2. **El supermercado no se nombra.** E y `copy.md` §13 lo llaman por su nombre
   de fantasía; ese nombre ya identifica a un cliente en la consola del
   operador y `test_landing_ataques.py` §L05 lo prohíbe en una página pública.
   En pantalla dice «Supermercado de ejemplo», que es lo que ya decían el
   rótulo del plano y la barra de los perfiles.
3. **«Hablemos» va a `/login#registro`, no a un `mailto:` vacío.** E deja
   `href="mailto:"` mientras el correo de contacto sea un `[COMPLETAR]`. Se
   mantuvo la decisión que ya estaba tomada en la landing anterior: un botón
   primario que no hace nada es peor que uno que abre la puerta. El
   `[COMPLETAR: correo de contacto]` sigue visible en el párrafo de al lado.
4. **La llave del tema es `recabra-tema-landing`** (la que ya usaba la app), no
   `recabra-tema`. El comportamiento es el de E: sin preferencia guardada,
   oscuro.
5. **El `<main>` se llama `contenido`** y el enlace de salto apunta ahí, como
   en E; antes era `#main`. Se actualizó el assert correspondiente.
6. **Los tres contadores de la leyenda del plano son estáticos** (7 / 3 / 6),
   no animados. En E suben desde cero al arrancar; acá la leyenda está dentro
   del plano, que se construye después del primer cuadro, y una cifra que sube
   sola en el borde inferior competía con la entrada de la cámara. Los
   contadores de la barra superior sí suben, que es donde se leen.
7. **La sala de «Cómo se arranca» usa un `viewBox` fijo de 640 × 300** con
   `preserveAspectRatio`, en vez de recalcularlo contra el tamaño real de la
   caja en cada `resize`. Se ve igual salvo por unos milímetros de aire a los
   costados en pantallas muy anchas, y evita reconstruir la escena entera al
   redimensionar.
8. **No hay bloque `<noscript>`.** E lo trae para que su página se lea sin
   JavaScript; esta landing es un componente de React y sin JavaScript no hay
   página que corregir.
9. **Los tres diales de E quedaron donde E los dejó**: el film ocupa el hero y
    las seis tarjetas (no se movió hacia A ni hacia C), los acercamientos
    siguen en 1,7×–1,95×, y el amarillo de acción convive con el ámbar de «se
    libera» (opción **(a)** del README de E). Mover cualquiera de los tres es
    cambiar `ESC` en `PlanoIsometrico.tsx`; la decisión sigue siendo del dueño,
    y la del naranja arrastra la auditoría de contraste.

---

## Verificación

- `cd frontend && npx tsc --noEmit` → limpio.
- `npm run probar:landing` → **21 pruebas, todas verdes** (render real con
  `react-dom/server`, datos de ejemplo, copy, CSS acotado a `.lp`, three.js
  sólo por `import()`).
  Se actualizaron **dos** asserts, los dos por decisiones del dueño y no para
  hacer pasar la prueba: el titular (ahora «Recabrá cada metro.», con el
  titular viejo de subtítulo y sus palabras partidas en `<span>` de color) y el
  ancla del enlace de salto (`#contenido`).
- `TMPDIR=/tmp/pt-front pytest backend/tests/test_landing.py
  backend/tests/test_landing_ataques.py` → **49 pasan, 1 se salta** (la que
  pide `frontend/dist`), sin tocar una línea de esos dos archivos.
- Servidor de desarrollo en un puerto propio (5273), levantado y apagado: la
  página y los módulos nuevos se sirven sin error de transformación.
- **No se corrió** la suite completa ni `npm run build`: los corre el
  Verificador, en serie.
- **No hay commit ni push.**

### Lo que no se pudo verificar acá

Este entorno no tiene navegador (ni Chromium ni Playwright), así que **no hay
capturas nuevas ni medición de LCP**. Queda para el Verificador, en este orden:
360 / 768 / 1024 / 1440 / 1920 px en claro y oscuro; el recorrido de la cámara
con el scroll; el pellizco y el arrastre en táctil; `prefers-reduced-motion`
activo (cámara quieta, pruebas visibles, pasos legibles); y que «Recorrerla»
—y sólo «Recorrerla»— baje el chunk de three.js.
