# ENTREGA — Fase 9 · Landing pública de RECABRA

Rama `claude/fase-9-landing` (encima de `origin/main` = `3a7b654`, Fase 8 ya
mergeada), árbol de trabajo **sin commitear**: 5 archivos modificados
(+121/−17: `docs/ESTADO.md`, `frontend/index.html`, `frontend/package.json`,
`frontend/src/App.tsx`, `frontend/src/pages/Login.tsx`) y nuevos
`frontend/src/pages/Landing/` (5 archivos, 2.725 líneas),
`frontend/scripts/probar-landing.mjs`, `backend/tests/test_landing.py`,
`backend/tests/test_landing_ataques.py` y `features/landing/outputs/`
(copy, diseño, prototipo, frontend, auditoría, 17 capturas). Fecha: 2026-09-06.

## Veredicto del Maestro

**La fase está construida entera, es coherente y la frontera aguantó. NO se
puede desplegar todavía**: hay dos defectos que corregir y siete datos que sólo
el dueño tiene.

Lo que está bien y se verificó con cifras: `/` sin sesión pinta la landing y
con sesión sigue mostrando el tablero de siempre; `/login`, `/login?invitacion=`,
el enlace de montaje (`/?montar=…&t=…`, que apunta a la raíz) y
`/politica-datos` intactos; cero llamadas a `/api/*`, cero violaciones de CSP
en consola, cero datos de cliente real; three.js **de verdad** fuera del primer
pintado (chunk propio de 732 kB que sólo baja al tocar «Ver en 3D»); `tsc`
limpio, `build` limpio, suite completa verde dos veces en serie (990 pruebas,
1 saltada, 7 xfail conocidos), 21 pruebas propias de la landing y 28 del
auditor en verde; cada cifra del copy cruzada contra el código.

Lo que NO pasa, en orden de gravedad:

1. **Recorte horizontal a 360 px** (defecto real, nadie lo había visto): el
   botón «Crear mi cuenta» de la barra y el final de las líneas del hero quedan
   cortados contra el borde derecho, sin barra de scroll que lo delate. Causa
   exacta y arreglo de una línea en §4.1. Choca de frente con el requisito
   «responsive de 360 a 1920 px» de la spec.
2. **LCP 3,42 s en 4G lento** contra un objetivo de < 2,5 s (en 4G rápido da
   1,8 s y cumple). No es el plano ni three.js: es el peso del chunk de
   entrada (294 kB de `index-*.js`) más la hoja de fuentes de Google que
   `index.html` sigue bajando para la aplicación de adentro y que la landing no
   usa. Palancas en §4.2.
3. **Siete `[COMPLETAR]` visibles y un botón muerto**: precio, unidad, correo
   de contacto, razón social, NIT, ciudad y correo de protección de datos, más
   el CTA «Hablemos» que hoy es `href="mailto:"` sin dirección. Son del dueño
   (§5.4); mientras no estén, la página no se publica.

Y cuatro cosas menores que conviene cerrar en el mismo PR: `robots.txt`
(hoy `/robots.txt` devuelve la landing en HTML), las dos anclas muertas hacia
la política de datos, el `og:image` que falta (con `twitter:card =
summary_large_image` ya puesto), y una omisión de honestidad en el copy del
precio (el escalón `suspendido` no se cuenta). Todo en §4.

## 1. Qué se construyó

Se trabajó en el orden que fijó la spec: copy → diseño a ciegas → frontend,
con un auditor de frontera en paralelo y un Verificador al final.

### 1.1 Copy (`outputs/copy.md`, 853 líneas)

Todo el texto de la página, sección por sección, con texto FINAL más una línea
de intención. Escrito contra el producto real (`docs/ESTADO.md` completo,
`features/*/spec.md`, capturas y maquetas). Decisiones que condicionaron todo
lo demás:

- **Voseo neutro y liviano**, el mismo que ya habla la aplicación
  (`Login.tsx`: «Escribí el nombre del supermercado»). Glosario obligatorio
  (canon, sede, mercaderista, montaje) y prohibido (SaaS, endpoint, KPI,
  dashboard, spread, benchmark).
- **Cada cifra tiene archivo de origen** (§12 del copy): recordatorios a
  **30, 15 y 6 días** (`services/reminders.py`, no 30/15/7), enlace de montaje
  **30 días** (`auth.py`), planilla **300 filas** (`bulk_leases.py`),
  «Renovar» a **≤ 60 días**, **9 temporadas** (`types/seasons.ts`), **15 tipos
  con tarifa** (`fixtures.ts`), desvío desde **1 %**. La leyenda usa el texto
  exacto de `DashboardView.tsx`: «Libre todo el periodo» / «Se libera en el
  periodo» / «Tomado» / «Resto de la sala».
- **Dos decisiones de honestidad**: la sección de Asesoría no promete un panel
  dentro de la cuenta del supermercado (las recomendaciones salen de la consola
  del operador y llegan por la sesión de asesoría, y lo dice con todas las
  letras junto al reporte de transparencia); y las capturas que hay en
  `features/*/outputs/capturas/` son de la consola del operador con un cliente
  de prueba y **no van** en la landing.
- **§13, datos de ejemplo**: supermercado inventado con 2 sedes (CENTRO,
  PALMAS), 16 muebles alquilables (7 libres / 3 se liberan / 6 tomados) con
  prefijos reales de `nomenclatura.ts` y 8 proveedores inventados. **§14, 28
  puntos de «lo que NO prometemos»** (sin pasarela, sin facturación
  electrónica, no genera ni firma el contrato, sin ERP ni API pública, sin app
  nativa ni WhatsApp, sin histórico por espacio, ninguna cifra de impacto de
  negocio — porque `docs/ESTADO.md` ya verificó que ninguna se sostiene).

### 1.2 Diseño (`outputs/diseno.md`, 742 líneas + `outputs/prototipo/index.html`, 96 kB)

Hecho sólo con `copy.md` y `spec.md`, sin ver el frontend ni la paleta actual,
con `ui-ux-pro-max`, `design-system`, `brand`, `ui-styling` y `dataviz` (el
validador de paleta corrido de verdad sobre los colores de estado, en claro y
oscuro). Concepto en §2. Entrega tokens en tres capas (primitivo → semántico →
componente) con dos juegos completos claro/oscuro, especificación de las diez
secciones, el plano isométrico especificado y construido en el prototipo
(proyección 2:1, dos sedes en la misma lámina, zoom/arrastre/pinza/teclado,
ficha de `PUN-02` que se abre sola a los 700 ms), y diez decisiones abiertas
para el dueño. El prototipo se abre con doble clic, sin red.

### 1.3 Frontend (`outputs/frontend.md`, 271 líneas)

| Archivo | Qué es |
|---|---|
| `frontend/src/pages/Landing/Landing.tsx` (902 líneas) | Las nueve secciones con el copy literal, incluidos los `[COMPLETAR]` como chips rayados visibles. |
| `frontend/src/pages/Landing/landing.css` (727) | Tokens y componentes de «Planta y tinta», **todo bajo `.lp`** porque redefine nombres que ya usa `src/index.css`; hay una prueba que falla si un selector se escapa. |
| `frontend/src/pages/Landing/datos.ts` (137) | El supermercado de ejemplo: 16 alquilables, ~30 muebles de contexto, dos sedes. |
| `frontend/src/pages/Landing/PlanoIsometrico.tsx` (694) | SVG propio; paneo y zoom como un solo `transform` por `ref` sin re-render; rueda armada con el primer clic para no secuestrar el scroll; teclado completo; ficha por hover/toque/foco (hoja inferior en ≤ 720 px); leyenda, `figcaption` largo, tabla equivalente y límite de error con «Reintentar». |
| `frontend/src/pages/Landing/Vista3D.tsx` (265) | three.js real, **escena mínima propia** (no `StoreEditor3D`, que arrastra fiber/drei/store/API); entra por `lazy(() => import(...))`; se pinta a pedido, no en bucle; errores de chunk y de WebGL con «Volver al plano». |
| `frontend/src/App.tsx` | Ruteo sin sesión: `/politica-datos` → montaje → `/` = Landing → **cualquier otra ruta sigue montando `Login`**. Y **todas las pantallas de adentro pasan a `React.lazy` + `Suspense`** (ver abajo). |
| `frontend/src/pages/Login.tsx` | Tres líneas: `/login#registro` abre en modo registro (destino de los dos CTA). |
| `frontend/index.html` | `<title>`, description, robots, Open Graph, `twitter:card`, servidos en el HTML. |
| `frontend/scripts/probar-landing.mjs` + `npm run probar:landing` | 21 pruebas: render real con `react-dom/server`, copy, datos, aislamiento CSS, import perezoso. |
| `backend/tests/test_landing.py` | 11 pruebas de rutas públicas y SEO servido. |

**El hallazgo que cambió el armazón.** La landing no importaba `three`, pero
`main.tsx → App.tsx → Dashboard → StoreEditor3D` lo metía en el chunk principal:
el visitante anónimo bajaba el motor 3D, el editor y el SDK de Firebase antes
de leer el titular. Lo detectó el auditor (H-1, test rojo) y el frontend lo
arregló pasando `Dashboard`, `Login`, `Montaje`, `PoliticaDatos`, `Plataforma`,
`ReportePlataforma` y `DetalleCliente` a `React.lazy`. Es un cambio para todos
los usuarios de adentro, no sólo para la landing; el Verificador probó a mano
login, tablero, invitación, montaje y política y no encontró regresión.

### 1.4 Red team (`outputs/auditor-frontera.md`, `backend/tests/test_landing_ataques.py`, 28 pruebas, 1.172 líneas)

Cubre los cuatro bordes que nacen con una `/` pública: (a) cero API/sesión,
también por rebote de módulos importados; (b) cero clientes reales (lista
negra de nombres del registro + huellas de export: UUID, `clienteSlug`,
`leaseId`, correos de dominio real); (c) CSP: ningún recurso externo en los
archivos nuevos, ningún `<script>` inline ni `on*=` en `index.html`, la
política del backend clavada directiva por directiva; (d) los nueve enlaces
que ya circulan devuelven el mismo cascarón 200 sin cookie, con el orden de
guardas de `App.tsx` vigilado; (e) accesibilidad estática. Más L00, un
meta-test que le pasa a cada detector una muestra que debe encender. Un mayor
(H-1, ya cerrado), dos menores (H-2 robots, H-3 mailto vacío) y dos
observaciones (H-4 MercaFresco en un comentario, H-5 anclas muertas). Ninguna
aserción se aflojó.

## 2. El concepto de diseño: «Planta y tinta»

La página no *habla* de un plano: **es** un plano. El copy define el producto
con una pregunta espacial y contable a la vez —«qué mueble está libre, quién
lo ocupa, a cuánto y hasta cuándo»— y el único objeto real donde esas dos
cosas ya viven juntas es el plano de la sala colgado en la oficina de atrás
del supermercado, con anotaciones a mano. El diseño toma esa hoja técnica y la
vuelve interactiva: papel cálido (`#F7F4EE`) con tinta fría, marcas de registro,
numeración de sección en monoespaciada, reglas de 1 px, y el plano isométrico
como héroe cuyo lenguaje (isometría, grises, códigos mono) se derrama sobre toda
la página — las tramas de fondo del hero y del cierre son la misma retícula
isométrica desvanecida. La tipografía es la del sistema operativo de quien
mira (SF Pro / Segoe UI Variable / Roboto + monoespaciada del sistema con
`tabular-nums`): cero descargas, cero FOIT, cero CLS, y la CSP se cumple sin
tocarla. La personalidad la ponen la escala fluida, el tracking negativo de
los titulares y el contrapunto mono.

El color es escaso porque el inventario es escaso: la economía cromática de la
página repite el argumento del producto (regla §13.1 del copy: «si todo el piso
está pintado, no se entiende que lo que se vende es escaso»). El 95 % de la
superficie es papel, tinta y gris; lo único saturado son los cuatro estados del
plano —validados con el script de `dataviz` en claro (`#0E8A63` / `#E8992B` /
`#C3283F`, ΔE protan 14,1) y en oscuro (`#22A87A` / `#DDA13A` / `#E45C6E`)— y
un **ultramar** (`#3A34D6` claro, `#8E92FF` oscuro) reservado exclusivamente a
acciones, elegido justamente porque verde, ámbar y rojo ya significan «estado
del espacio» y un botón verde competiría con «Libre todo el periodo». Nada
decorativo: cada gráfico explica algo del producto (la cuenta del plazo, los
tres correos sobre la línea 30/15/6, las dos caras de la misma góndola con
estados distintos, el hueco en la tendencia dibujado como corte de línea y la
palabra «sin datos», porque «un cero sería mentira»). Y dos asimetrías que son
decisiones de honestidad: en «Los números que vas a tener a la vista» sólo
Ocupación lleva cifra (35 %, la única verificada), las otras cuatro llevan
rótulo sin número; y la banda de Asesoría es el único evento tonal de la página
(invertida a noche), mientras Confianza se dejó deliberadamente sin diseñar:
cinco filas y reglas, sin escudos ni candados.

## 3. Verificación (cifras del Verificador, corridas en serie)

| Qué | Resultado |
|---|---|
| `cd frontend && npx tsc --noEmit` | exit 0, sin salida |
| `npm run build` | exit 0, 2.223 módulos, 9,92 s. `index-*.js` 300,36 kB (98,97 gzip), `index-*.css` 72,02 kB, `three.module-*.js` 732,04 kB (189,55 gzip), `Dashboard-*.js` 1.058 kB, `Vista3D-*.js` 4,17 kB, `Login-*.js` 15,56 kB |
| Suite backend, dos corridas en serie (`.db` borradas entre una y otra) | exit 0 ×2, **990 pruebas**, 1 saltada (L02: la landing no importa ningún módulo preexistente — el mejor resultado posible), 7 xfail conocidos, sin `.db` residuales |
| `npm run probar:landing` | 21 en verde |
| `pytest tests/test_landing.py` / `test_landing_ataques.py` | 11 verdes / 27 verdes + 1 saltada (H-1 ya en verde) |
| three.js fuera del primer pintado | Estático: `three.module-*.js` sólo aparece en `__vite__mapDeps` de `index-*.js`, sin `modulepreload`. Dinámico: 0 peticiones con «three» hasta tocar «Ver en 3D»; entonces bajan `Vista3D-*.js` + `three.module-*.js` y se monta 1 `<canvas>` |
| `/` con sesión de cliente (`retail-auth-v1`, `galerias`) | Tablero de siempre, 0 nodos `.mesa__stage`, 0 errores (`capturas/con-sesion-raiz.png`) |
| `/login?invitacion=`, `/?montar=…&t=…`, `/politica-datos`, `/login#registro` | Login completo / pantalla de Montaje (no la landing) / política / formulario en modo registro |
| API y CSP en 5 corridas de navegador (360/1440 × claro/oscuro + interacciones) | **0** peticiones a `/api/`, **0** mensajes de CSP, **0** `pageerror`. Único origen externo: la hoja de fuentes de Google que ya estaba en `index.html:43` |
| Plano: rueda / botones / arrastre / centrar | `scale 1,25 → 1,425` (rueda) → `1,25`; `+` → `1,60`; arrastre 140×90 px → `translate(-137,-278)` misma escala; «Centrar» devuelve el transform inicial exacto. Hover abre ficha (CAJ-02 / Confites Milagro / $ 850.000). Teclado y `prefers-reduced-motion` OK |
| **LCP** (PerformanceObserver, Pixel 7 emulado, 3 corridas por perfil, fuentes por stub) | **Slow 4G (1,6 Mbps · 150 ms · CPU 4×): 3.412 / 3.420 / 3.428 ms — NO cumple < 2,5 s.** 4G rápido (9 Mbps · 85 ms · CPU 4×): 1.804–1.888 ms, cumple. Sin throttling de CPU: ~1.310 ms. Elemento LCP: `p.lead` del hero. Primer pintado: 365 kB en 4 recursos. Con la red real del entorno (que resetea la hoja de fuentes) el LCP se fue a ~13,9 s: en producción no pasa, pero confirma que esa hoja bloquea |
| Responsive 360 → 1920 | **Parcial**: 140 elementos fuera de la ventana a 360 px, 196 a 320 px, 51 a 768 px (legítimos: el `<g>` del SVG y la tabla en `.scroll`), 1 a 1920 (el `.skip`, a propósito). Ver §4.1 |
| Copy contra `docs/ESTADO.md` | Todo coincide: `$ 1.500.000 × 61 días = $ 3.050.000` (ESTADO:1469), 30/15/6 (ESTADO:2925), 9 temporadas, 8/23 caras = 35 %, `TOPE_CANDIDATOS = 3`, asesoría como revisión humana con bitácora. Una omisión: §4.5 |
| SEO servido en el HTML de `/` | `lang="es"`, title, description, robots, `og:*`, `twitter:card`. **Falta `og:image`** |

**Capturas** (17, en `features/landing/outputs/capturas/`): `landing-{360,1440}-{light,dark}.png`
(página completa, DPR 2; alto 17.654 px a 360, 10.304 px a 1440) y sus `-hero`;
`interaccion-arrastre-zoom.png`, `interaccion-hover-ficha.png`,
`interaccion-ver-en-3d.png`, `con-sesion-raiz.png`, `login-invitacion.png`;
más `prototipo-{hero-1440,completo-1440,390}.png` del prototipo de diseño.
Aviso: salieron con fuentes del sistema porque el navegador del entorno no llega
a `fonts.googleapis.com` — que para la landing es justamente la tipografía del
diseño, pero para `/login` no.

## 4. Conflictos abiertos y qué hacer con cada uno

### 4.1 BLOQUEANTE — recorte horizontal a 360 px (defecto, arreglo de una línea)

`frontend/src/pages/Landing/landing.css:285-286`:

```css
.lp .mesa__stage { ... aspect-ratio: 16 / 11; min-height: 300px; ... }
@media (max-width: 640px) { .lp .mesa__stage { aspect-ratio: 4 / 3.4; } }
```

Un `min-height` fijo combinado con `aspect-ratio` impone un **ancho mínimo**:
300 × 4/3,4 ≈ 353 px + 2 px de borde = 355 px de `min-content` para
`figure.mesa` (medido), contra 320 px de caja de contenido a 360 px. La pista
del grid del hero crece a 354,94 px y `.hero__col`, el `h1`, `p.lead` y
`.nav__act` se van de x=20 a x=374,9. `scrollWidth` sigue dando 360, así que no
aparece barra: se recorta en silencio. Se ve en
`capturas/landing-360-light-hero.png`.

Arreglo: en el `@media (max-width: 640px)` bajar `min-height` (a 0 o a un valor
que quepa: 320 × 3,4/4 ≈ 272 px) o cambiar a `min-height: auto` y dejar que el
`aspect-ratio` mande. Después volver a medir con el script del Verificador
(`scratchpad/probe360.mjs`: rectángulos elemento por elemento, no
`scrollWidth`). Territorio: frontend.

### 4.2 BLOQUEANTE por spec — LCP 3,42 s en 4G lento (objetivo < 2,5 s)

La landing en sí es liviana (SVG propio, cero imágenes, cero fuentes). Lo que
pesa es el chunk de entrada: 294 kB de `index-*.js` para una página que no
necesita la aplicación. Dos palancas, ninguna aplicada:

1. **Sacar el `<link>` de `fonts.googleapis.com` de `frontend/index.html:43`**
   e inyectarlo desde JS sólo cuando monta una pantalla de adentro. Una hoja de
   estilos externa bloquea el pintado y la landing no la usa. Cambia cómo cargan
   Chivo y Archivo Narrow para todos los usuarios internos (posible FOUT en
   `/login`), por eso el frontend no lo hizo sin pedirlo. Es lo primero a mirar.
2. **Bajar el entry**: lo que queda en `index-*.js` después del `lazy` de las
   pantallas (React, router, store, cliente de API, Landing). Ver con
   `vite-bundle-visualizer` qué sobra para un visitante anónimo.

Si el dueño acepta 4G rápido (1,8 s) como la vara realista para Colombia, se
documenta en ESTADO y la spec se enmienda; si no, el ajuste va en este PR.

### 4.3 H-2 (menor) — `/robots.txt` devuelve la landing

`<meta name="robots" content="index, follow">` viaja en el cascarón de TODA la
aplicación y el catch-all del backend (`app/main.py:396-404`) devuelve 200 +
HTML para cualquier path: `/robots.txt`, `/sitemap.xml` y `/no-existe` son
soft-404 indexables con el título de la landing. Arreglo sin backend:
`frontend/public/robots.txt` con `Allow: /` y `Disallow: /plataforma`,
`/login`, `/reporte-plataforma` (Vite lo copia a `dist/` y la rama
`file.is_file()` del catch-all lo sirve tal cual).

### 4.4 H-3 (menor) — «Hablemos» es un `mailto:` vacío

`Landing.tsx:733`. Mientras el dueño no ponga el correo, el botón primario de
la sección de precio abre un compositor sin destinatario: para quien lo toca es
un error, no un pendiente. Mientras tanto, que apunte a `/login#registro` o no
sea botón.

### 4.5 Copy — el escalón `suspendido` no se cuenta

«Qué pasa si un mes te atrasás» (copy §8, `Landing.tsx` sección precio) dice:
aviso → solo lectura → «tus datos no se borran nunca». Es cierto pero
incompleto: el producto tiene un tercer estado, `suspendido`, que «corta todo
salvo el login del owner» (`docs/ESTADO.md:173`, `:1118`; el propio copy §12
lista los 4 estados). Un gerente lee que el peor caso es «entrar y mirar».
Decisión del dueño: o se agrega una cuarta línea («Si el atraso se prolonga,
la cuenta se suspende: sólo el dueño puede entrar, y todo vuelve al ponerla al
día») o se deja así a sabiendas. Recomendación del Maestro: agregarla, porque
la regla n.º 1 del copy es «nada que el producto no haga» y la página se vende
justamente por contar antes de que pase.

### 4.6 H-5 (observación) — anclas muertas hacia la política

`Landing.tsx:687` → `/politica-datos#transparencia` y `:797` →
`/politica-datos#derechos`. `src/legal/markdownLite.tsx` no emite `id` en los
encabezados: el enlace abre la política arriba de todo. Arreglo: `id` derivado
del texto en `markdownLite` (territorio legal/compliance) o enlazar a
`/politica-datos` a secas.

### 4.7 `og:image` — falta la imagen

`index.html:29-33` lo declara como hueco y `twitter:card = summary_large_image`
ya está puesto: la tarjeta compartida sale sin ilustración. Hace falta un PNG
local de 1200 × 630 con el plano de ejemplo (el `og:image:alt` ya está escrito
en copy §1). Ahora que hay navegador en el entorno del Verificador, se puede
rasterizar desde `capturas/landing-1440-light-hero.png` o con un script sobre
el prototipo. Sin la etiqueta hasta que exista el archivo (una ruta rota es
peor que una tarjeta chica).

### 4.8 H-4 (observación) — `MercaFresco`

El nombre está en un comentario de `datos.ts:2` y en `copy.md` §13; no llega al
navegador (la landing rotula «Supermercado de ejemplo»). Pero `MercaFresco` ya
identifica a un cliente de prueba en las capturas de la consola del operador
(`features/tendencia/outputs/ENTREGA.md:145`). Renombrarlo en el comentario y
en el copy por un nombre que no aparezca en ningún otro lado del repo; L05 lo
bloquea si sube a código renderizado.

### 4.9 Documentación desactualizada que esta fase destapó

`docs/ESTADO.md:3330-3345` («La paleta y la escala de letra») dice que «Se
libera en el periodo» es `#3AAE99`; el código dice `#F08519` (naranja:
`index.css:103 --entra`, `DashboardView.tsx:507 RANGE_TOP.parcial`). Es la
tabla que el copy y la spec citan como «el mismo lenguaje que FloorPlan2D». No
es de esta fase, pero conviene corregirla en el mismo PR.

### 4.10 Aceptado sin cambio

- **El `main` local está en la Fase 4**; la base real es `origin/main`. Los
  tests del auditor lo resuelven tomando la más nueva de las dos.
- **Encuadre inicial del plano en escritorio**: PALMAS queda cortada arriba a
  la derecha (invita al arrastre, es diseño) y el rótulo «CENTRO» queda tapado
  por la ficha de `PUN-02` que se abre sola. Se ve en las capturas; no es
  defecto.
- **Sin vitest**: las pruebas del frontend siguen el estilo del repo
  (`scripts/probar-*.mjs` con esbuild). Montarlo excede la fase.

## 5. Decisiones que el dueño tiene que tomar mirando el resultado

Abrir `capturas/landing-1440-light.png`, `landing-1440-dark.png` y
`landing-360-light.png`, y el prototipo (`outputs/prototipo/index.html`, doble
clic) para las interacciones. Nada se suavizó: donde el diseño nuevo choca con
la aplicación, quedó el diseño y el choque anotado.

### 5.1 Qué descartar por no ir con el producto

1. **Las dos sedes en la misma lámina** (CENTRO al frente, PALMAS asomando).
   Enseña el multi-sede gratis pero hace la escena más ancha — y es la razón
   última del `min-height` que recorta a 360 px. Si se prefiere una sola sede,
   se borra el bloque de PALMAS en `datos.ts` y el encuadre se recalcula solo.
2. **Los diagramas dibujados en «Cómo se usa»** en lugar de capturas reales.
   La spec pedía «capturas reales de la app (claro/oscuro)»; el copy decidió
   que las que existen son de la consola del operador y no pueden ir, y el
   diseño dibujó mini-interfaces. Si el dueño quiere capturas, se generan con
   `docs/maquetas/generadores/pantalla.mjs` (pantalla de sede, datos
   sintéticos) y el hueco ya está dimensionado.
3. **El gráfico de tendencia con datos de ejemplo** (rotulado como tal, con el
   mes «sin datos»). Si ni siquiera un ejemplo rotulado debe llevar cifras, el
   bloque funciona sólo con texto.
4. **El conmutador claro/oscuro en la barra**. Era comodidad de revisión; en
   producción puede quedarse o seguir sólo al sistema (se borra el botón y el
   tema se resuelve igual).
5. **La rueda se arma con el primer clic** (evita que el hero secuestre el
   scroll). El texto «Rueda para acercar» es cierto una vez tocado el plano; si
   se prefiere literal desde el primer segundo, es una línea.
6. **La banda oscura de Asesoría**, el gesto más fuerte de la página. La
   alternativa sobria es papel con borde superior grueso.

### 5.2 Lo que choca con la aplicación interior

7. **La landing y `/login` no se parecen.** La landing es papel cálido
   `#F7F4EE`, ultramar de acción `#3A34D6` y tipografía del sistema; la
   aplicación es papel frío, acento tinta, Chivo + Archivo Narrow (ESTADO,
   «La identidad, elegida en vez de heredada»). Quien toca «Crear mi cuenta»
   aterriza en una pantalla que no se parece a la página de la que viene.
   Tres salidas: (a) llevar `/login` (y sólo `/login`) a los tokens de la
   landing; (b) llevar la landing a Chivo/Archivo Narrow —lo que obliga a
   empaquetar las fuentes en el repo o a heredar el `<link>` de Google, y
   vuelve a pagar la hoja externa en el LCP—; (c) aceptar el corte. El
   Maestro recomienda (a): el login es una sola pantalla y el embudo importa
   más que la continuidad con un tablero que el visitante todavía no vio.
8. **Los colores de estado son los mismos cuatro, pero no los mismos
   hexadecimales.** Landing: `#0E8A63` / `#E8992B` / `#C3283F`; aplicación:
   `#00786A` / `#F08519` / `#8E1226` / `#D3D9DB`. El lenguaje coincide (verde
   libre, naranja se libera, rojo oscuro tomado, gris resto) y los dos juegos
   pasan el validador de `dataviz`, pero «lo que ve en la landing es lo que va
   a ver adentro» sería literal si la landing tomara los cuatro de `index.css`.
   Es un cambio de cuatro tokens en `landing.css:50-55` + revalidar la terna.
9. **El 3D es three.js real** (lo pide la spec), no la coreografía de cámara
   SVG de 700 ms que fingía el prototipo. Se ganó 3D de verdad como adentro
   del producto; se perdió una animación que pesaba cero y no podía fallar.
   Volver es borrar el `import()` y animar cuatro números (`diseno.md` §4.4).
10. **`App.tsx` con todas las pantallas de adentro en `React.lazy`.** Es lo
    que saca three y Firebase del primer pintado. Costo: un chunk extra al
    entrar (`Login-*.js` 15 kB, `Dashboard-*.js` 1 MB que antes venía en el
    entry) y una pantalla de fondo de `Suspense` de unos ms. El Verificador no
    vio regresión; conviene que el dueño lo pruebe en producción tras el
    deploy (login con Google, tablero, `/plataforma`, un enlace de montaje).
11. **La hoja de fuentes de Google en `index.html`** (§4.2): dejarla y
    aceptar el LCP, o moverla a inyección por JS para las pantallas de adentro.

### 5.3 Copy

12. **Contar o no el escalón `suspendido`** (§4.5).
13. **Renombrar `MercaFresco`** (§4.8) — el nombre no se ve, pero conviene.

### 5.4 Los siete `[COMPLETAR]` (sin ellos no se publica)

| Dónde | Qué | `Landing.tsx` |
|---|---|---|
| Precio | el número | `:705` |
| Precio | la unidad: por supermercado al mes, por sede al mes, u otra | `:708` |
| Precio | correo de contacto (y el `href` del botón «Hablemos») | `:728`, `:733` |
| Pie | razón social | `:804` |
| Pie | NIT | `:804` |
| Pie | ciudad | `:804` |
| Pie | correo de protección de datos | `:806` |

Razón social, NIT y correo de protección de datos son los mismos `[COMPLETAR]`
que ya están abiertos en `docs/legal/politica-datos.md`: cerrarlos ahí y en la
landing con el mismo valor. Sobre el precio, el copy y `docs/ESTADO.md` ya
fijaron el modelo: transferencia contra cuenta de cobro, sin pasarela ni
tarjeta; la landing sólo necesita el número y su unidad. Si el dueño todavía no
quiere publicar precio, la alternativa honesta es reemplazar el chip por «Te lo
contamos en una llamada» y dejar el botón «Hablemos» con correo real — pero no
un chip rayado en producción.

## 6. Texto para `docs/ESTADO.md`

### 6.1 La regla dura (ya está en el árbol, `docs/ESTADO.md:81-95`, escrita por el frontend)

Se mantiene tal cual. Sólo reemplazar la última frase para que refleje lo que
el build confirmó:

> three.js entra sólo por el `import()` perezoso de «Ver en 3D» (`Vista3D.tsx`):
> el bundle inicial de `/` no lo lleva — y para que eso sea cierto **todas las
> pantallas de adentro (`Dashboard`, `Login`, `Montaje`, `PoliticaDatos`,
> `Plataforma`, `ReportePlataforma`, `DetalleCliente`) entran por `React.lazy`
> en `App.tsx`**; la landing es lo único que se importa estático. Un `import`
> normal de cualquiera de ellas vuelve a meter three y Firebase en el primer
> pintado; `test_landing_ataques.py::test_l17` lo vigila.

### 6.2 Sección «Fase 9» — insertar después de la Fase 8, antes de «Pendientes conocidos: clientes y plataforma» (`:1024`)

```markdown
### Fase 9 — Landing pública

**El problema (dueño, 2026-09-05).** Al abrir `retail-espacios.onrender.com`
lo único que había era el formulario de ingreso: nada decía qué es RECABRA,
para quién es ni por qué registrarse. La landing tiene que vender el sistema
y llevar al registro en 30 segundos.

**Ruteo.** Sin sesión, `App.tsx` resuelve en este orden y el orden es
vinculante: `/politica-datos` → enlace de montaje (`/?montar=…&t=…`, que
apunta a la RAÍZ, `routers/spaces.py`) → `/` = `Landing` → **cualquier otra
ruta = `Login`** (así un enlace guardado a `/reporte-plataforma` aterriza ahí
después de entrar). Con sesión, `/` sigue siendo el tablero o `/plataforma`.
`/login#registro` abre `Login` en modo registro; es el destino de los dos CTA
«Crear mi cuenta». `/login?invitacion=…` no se tocó (el canje sigue en el
backend). Sin backend nuevo: `/` es el mismo cascarón del SPA; no hay ningún
`/api/landing/*` (barrido de la tabla de rutas en `test_landing_ataques.py::l13`).

**Orden de trabajo (indicación del dueño, `features/landing/spec.md`).**
Copy primero (`outputs/copy.md`: texto final sección por sección, cifras con
archivo de origen en §12, datos de ejemplo en §13, 28 «no prometemos» en §14),
después diseño **sin referencias visuales** —sólo copy y spec, sin capturas ni
paleta—, y recién después frontend con lo funcional heredado (rutas, CSP,
three.js perezoso) y la estética del diseño nuevo. Lo que choca con la
aplicación interior se documenta como decisión del dueño, no se suaviza.

**Lo que se construyó.** `src/pages/Landing/`: `Landing.tsx` (nueve secciones
con el copy literal), `landing.css` (tokens y componentes **todos bajo `.lp`**:
redefine `--bg`, `--surface`, `--ink`, `--accent`, `.card`, `.nav`, `.btn` que
`src/index.css` ya usa; `probar-landing.mjs` falla si un selector se escapa),
`datos.ts` (supermercado inventado: 2 sedes, 16 alquilables 7/3/6, ~30 muebles
de contexto, prefijos de `nomenclatura.ts`, proveedores inventados — nunca
reemplazar por marcas reales), `PlanoIsometrico.tsx` (SVG propio, proyección
2:1, paneo/zoom como un solo `transform` por `ref`; rueda armada con el primer
clic para no secuestrar el scroll; teclado completo; ficha con el orden de copy
§11.2; leyenda con la palabra al lado del color; tabla equivalente; límite de
error) y `Vista3D.tsx` (three.js, **escena mínima propia, NO `StoreEditor3D`**,
que arrastra fiber/drei/store/API; entra por `lazy(() => import(...))`, se
pinta a pedido, libera renderer al desmontar). SEO en `index.html` servido en
el HTML: title, description, robots, `og:*`, `twitter:card`. Tema claro/oscuro
por `data-lp-tema` con preferencia guardada; `prefers-reduced-motion` respetado.

**Diseño «Planta y tinta»** (`outputs/diseno.md` + `outputs/prototipo/`): la
página es un plano — papel cálido `#F7F4EE`, tinta, retícula isométrica,
tipografía del sistema (cero descargas, por eso cumple la CSP sin tocarla),
ultramar `#3A34D6` como único color de acción porque verde/ámbar/rojo ya
significan estado. Estados validados con el validador de `dataviz` en claro y
oscuro. Sólo Ocupación lleva cifra en «los números que vas a tener a la
vista»; las otras cuatro, rótulo sin número: es la prueba visual de que nadie
promete «+30 %».

**Cifras del copy, todas con origen.** Recordatorios 30/15/6
(`services/reminders.py`, no 30/15/7); enlace de montaje 30 días (`auth.py`);
planilla 300 filas (`bulk_leases.py`); «Renovar» a ≤ 60 días; 9 temporadas
(`types/seasons.ts`); 15 tipos con tarifa (`fixtures.ts`); desvío desde 1 %;
`$ 1.500.000 × 61 días = $ 3.050.000` (este documento); ocupación de ejemplo
35 % = 8 de 23 caras. Regla: si un número no está en copy §12, no se escribe.
La sección de Asesoría NO promete un panel dentro de la cuenta del
supermercado: las recomendaciones salen de la consola del operador y llegan
por la sesión de asesoría, y la landing lo dice junto al reporte de
transparencia. Las capturas de `features/*/outputs/capturas/` son de la
consola del operador con un cliente de prueba y no van en la landing.

**El armazón cambió.** La landing no importaba three, pero `main.tsx → App.tsx
→ Dashboard → StoreEditor3D` lo metía en el chunk principal y el visitante
anónimo bajaba el motor 3D y Firebase antes del titular (hallazgo H-1 del
auditor). Por eso **todas las pantallas de adentro entran por `React.lazy`**
con una frontera `Suspense` en `App.tsx`. Build: `three.module-*.js` 732 kB
en chunk propio, `Dashboard-*.js` 1.058 kB aparte, `index-*.js` 300 kB.

**Verificación (2026-09-06).** `tsc` limpio; `build` limpio; suite completa
verde dos veces en serie (990 pruebas, 1 saltada, 7 xfail); 21 pruebas propias
(`npm run probar:landing`, render con `react-dom/server`), 11 de rutas
(`test_landing.py`) y 28 del red team (`test_landing_ataques.py`: cero API,
cero sesión, cero red, cero clientes reales, cero recursos externos, CSP
directiva por directiva, los nueve enlaces que circulan devuelven el mismo
cascarón, orden de guardas, grafo estático sin three). En navegador: 0
peticiones a `/api/`, 0 violaciones de CSP, 0 errores; three sólo baja al tocar
«Ver en 3D». **LCP en Slow 4G: 3,42 s** (objetivo < 2,5 s; en 4G rápido 1,8 s):
lo que pesa es el chunk de entrada y la hoja de fuentes de Google de
`index.html` que la landing no usa. Capturas 360/1440 × claro/oscuro en
`features/landing/outputs/capturas/`.

**Pendientes al cierre de la fase** (detalle en
`features/landing/outputs/ENTREGA.md`): recorte horizontal a 360 px por
`min-height: 300px` + `aspect-ratio` en `.mesa__stage` (`landing.css:285`);
LCP en 4G lento; `frontend/public/robots.txt` (hoy `/robots.txt` devuelve la
landing en HTML); anclas `#transparencia`/`#derechos` muertas porque
`markdownLite` no emite `id`; `og:image` 1200×630; el copy del atraso no cuenta
el escalón `suspendido`; los siete `[COMPLETAR]` (precio, unidad, correo de
contacto, razón social, NIT, ciudad, correo de protección de datos) y el
`mailto:` vacío de «Hablemos». Decisiones del dueño: `/login` no se parece a
la landing (papel cálido + ultramar + sistema vs. papel frío + tinta + Chivo);
los cuatro colores de estado son el mismo lenguaje pero no los mismos hex que
`index.css`; dos sedes o una; diagramas o capturas en «Cómo se usa».
```

### 6.3 Corrección en «La paleta y la escala de letra» (`:3330-3345`)

En la tabla, «Se libera en el periodo» → `#F08519` (es lo que hay en
`index.css --entra` y `DashboardView.tsx RANGE_TOP.parcial`; `#3AAE99` quedó
de una iteración anterior).

### 6.4 Pendientes conocidos — agregar

- **Landing, 360 px**: `.mesa__stage` con `min-height` fijo + `aspect-ratio`
  impone 355 px de ancho mínimo y recorta el hero sin barra de scroll.
- **Landing, LCP**: 3,42 s en Slow 4G; palancas: hoja de fuentes de Google en
  `index.html` (inyectar por JS sólo adentro) y peso del entry.
- **`/robots.txt` devuelve HTML** por el catch-all; falta `frontend/public/robots.txt`.
- **`markdownLite` no emite `id` en encabezados**: toda ancla `#…` hacia
  `/politica-datos` aterriza arriba.

## 7. Qué le queda al humano

### 7.1 Cierre técnico (antes del PR, ~2 horas)

1. `landing.css:285-286`: `min-height` en móvil (§4.1). Medir a 320/360 con
   rectángulos, no con `scrollWidth`.
2. Decidir §4.2 y, si se acepta, mover el `<link>` de fuentes a inyección por
   JS para las pantallas de adentro; volver a medir LCP.
3. `frontend/public/robots.txt` (§4.3).
4. «Hablemos» → `/login#registro` mientras no haya correo (§4.4).
5. `og:image` 1200×630 desde el plano de ejemplo + etiquetas (§4.7).
6. Opcional en este PR: `id` en encabezados de `markdownLite` (§4.6);
   renombrar `MercaFresco` en `datos.ts:2` y `copy.md` §13 (§4.8); corregir
   la tabla de paleta de ESTADO (§6.3).
7. Aplicar §6.1, §6.2 y §6.4 en `docs/ESTADO.md`.
8. Suite completa dos veces en serie, `tsc`, `build`, y `grep` de los nombres
   del registro de producción sobre `dist/assets/*.js` (lo pidió el auditor;
   el Verificador construyó pero ese grep no se hizo).
9. Commit y PR contra `main`. No desplegar hasta 7.2.

### 7.2 Dueño (mirando las capturas y el prototipo)

- Los siete `[COMPLETAR]` de §5.4 — y la decisión sobre publicar precio o no.
- §5.1: sedes, diagramas vs. capturas, gráfico de ejemplo, conmutador, rueda,
  banda oscura.
- §5.2: qué hacer con `/login` (recomendación: llevarlo a los tokens de la
  landing), unificar o no los cuatro hex de estado, three.js real vs.
  coreografía SVG, aceptar el `lazy` global.
- §5.3: el escalón `suspendido` en el copy del precio.
- Después del deploy: probar en producción login con Google, tablero,
  `/plataforma` y un enlace de montaje, porque ahora entran por chunks aparte.

## Archivos de referencia

- Spec: `features/landing/spec.md`
- Copy: `features/landing/outputs/copy.md`
- Diseño: `features/landing/outputs/diseno.md`, `features/landing/outputs/prototipo/index.html`
- Frontend: `features/landing/outputs/frontend.md`
- Red team: `features/landing/outputs/auditor-frontera.md`, `backend/tests/test_landing_ataques.py`
- Capturas: `features/landing/outputs/capturas/` (17 PNG)
- Código: `frontend/src/pages/Landing/`, `frontend/src/App.tsx`, `frontend/src/pages/Login.tsx`, `frontend/index.html`, `frontend/scripts/probar-landing.mjs`, `backend/tests/test_landing.py`
