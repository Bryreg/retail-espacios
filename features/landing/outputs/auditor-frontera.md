# Red team — la frontera de la landing pública (Fase 9)

**Auditor adversarial.** Territorio: `backend/tests/test_landing_ataques.py`
(NUEVO, 1.172 líneas) y este informe. **Todo lo demás se leyó, nada se tocó.**
Ningún commit, ningún push, ni una línea de `frontend/src` ni de `backend/app`.

Precedente y disciplina: `features/auditoria/outputs/frontera.md` +
`backend/tests/test_auditoria_frontera.py` y
`features/transparencia/outputs/auditor-frontera.md`. **Acá no se arregla
código de producción**: un defecto se fija con un test que lo demuestra y se
cuenta acá con archivo:línea, reproducción y severidad.

**Por qué esta fase necesita un auditor propio.** Hasta la Fase 8, todo lo que
la aplicación pintaba salía de una sesión: sin token, `App.tsx` devolvía
`<Login />` y no había nada más que mirar. La Fase 9 rompe esa invariante:
`/` pasa a ser una pantalla larga, pública, indexable, **con un plano de un
supermercado adentro**. Cuatro bordes nuevos, y ninguno es teórico:

1. una llamada autenticada desde la landing no sólo filtraría datos: el
   interceptor de `api/client.ts` **borra la sesión ante cualquier 401**, así
   que un `fetch` fallido en la portada deslogueria al gerente que tenía su
   tablero abierto en otra pestaña;
2. el enlace del correo de montaje apunta **a la raíz**
   (`/?montar=CODE&t=TOKEN`, `backend/app/routers/spaces.py:413`) — exactamente
   la ruta que la landing se queda;
3. la CSP de la Fase 3 no tiene `'unsafe-inline'` en `script-src`: lo que se
   rompe por CSP **no se rompe en `npm run dev`**, se rompe en producción y en
   silencio;
4. el bundle no se arma por página, se arma por grafo (ver **H-1**).

**Estado del árbol cuando se auditó** (2026-09-05, rama `claude/fase-9-landing`,
base `origin/main` = `3a7b654`): copy y diseño entregados; el frontend
trabajando **en paralelo**, entregando archivos mientras esta suite corría —
`datos.ts` y `landing.css` primero, después `PlanoIsometrico.tsx`, `Vista3D.tsx`
y por último `Landing.tsx` (43 KB) con el cableado de `App.tsx`, `index.html`,
`Login.tsx` y `scripts/probar-landing.mjs`. La última corrida de esta suite es
contra el árbol COMPLETO: no quedó ningún ataque en estado "no verificable
porque el archivo no existía". Los huecos que quedan son de otra naturaleza y
están listados al final.

---

## Veredicto de frontera

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| **¿La landing llama a `/api/*` o lee la sesión?** | **NO.** Ni una ruta de API escrita, ni `useAuthStore`, ni `useFixtureStore`, ni `Authorization`/`Bearer`, ni la llave `retail-auth-v1`, ni un `import` de `api/*` o `store/*`. Tampoco por rebote: la landing no importa **ningún** módulo preexistente de `frontend/src` (grafo cerrado sobre `pages/Landing/`). Ni `fetch`, ni `XMLHttpRequest`, ni `WebSocket`, ni `sendBeacon`: cero red, ni siquiera al mismo origen. | L01, L02, L03 |
| **¿Hay datos de un cliente real?** | **NO en lo que se pinta.** Cero `galerias` / `Galerías Plaza` / `TERRON` / `NAVE` / `POBLADO` / `ciudad jardín` / `MercaFresco` en el código que llega al navegador; el plano son 46 piezas escritas a mano en `pages/Landing/datos.ts` con proveedores inventados y sedes `CENTRO`/`PALMAS`. Tampoco hay huellas de un export real (UUID, `clienteSlug`, `leaseId`, `supplierId`, correos de dominio real). **Salvedad:** el nombre `MercaFresco` sigue en un comentario, ver **H-4**. | L05, L05b |
| **¿Se cae algo de la CSP de la Fase 3?** | **NO.** Cero `<script src>`, `<link href>`, `@import`, `url()`, `<img src>` o `import()` a un dominio externo en los archivos nuevos; los únicos hosts escritos son `retail-espacios.onrender.com` (og:url) y `www.w3.org` (namespace de SVG). `frontend/index.html` no ganó ningún `<script>` inline ni manejador `onclick=` — que era el riesgo concreto, porque el conmutador de tema del prototipo vive así. La política del backend está clavada directiva por directiva y no se aflojó. | L06, L07, L08, L08b |
| **¿Se rompió algún enlace que ya circula?** | **NO.** `/`, `/login`, `/login?invitacion=…`, `/?montar=…&t=…`, `/politica-datos`, `/plataforma`, `/plataforma/reporte/:slug`, `/plataforma/clientes/:slug` y `/reporte-plataforma` devuelven todos **el mismo** cascarón del SPA, 200 `text/html`, sin cookie y con la CSP puesta. En `App.tsx`, la guarda del enlace de montaje y la de `/politica-datos` se resuelven **antes** que la landing, y la portada está acotada a la raíz (`esPortada`), así que cualquier otra ruta sin sesión sigue mostrando el login. | L09, L10, L10b, L11, L12a |
| **¿La landing agregó superficie pública en la API?** | **NO.** Barrido de la tabla de rutas entera: los únicos `GET /api/*` que contestan 200 sin token siguen siendo `/api/health` y `/api/auth/clientes`. No hay `/api/landing/*` ni nada parecido; el plano no necesita servidor. | L13 |
| **¿El 3D es de verdad bajo demanda?** | **En la landing, SÍ; en el bundle que baja el visitante, NO.** `PlanoIsometrico.tsx:20` hace `lazy(() => import("./Vista3D"))` y `Vista3D.tsx` es el único archivo de la landing que toca `three` — impecable. Pero `App.tsx` importa el tablero de forma estática y el tablero arrastra `StoreEditor3D` → `three` + `@react-three/fiber` + `@react-three/drei` al chunk principal. **Ver H-1.** | L14 (verde), **L17 (ROJO)** |
| **¿Se puede usar sin mouse y con movimiento reducido?** | **Sí, en lo que se puede comprobar leyendo el código.** Cero `<img>` sin `alt` (cero `<img>`, todo es SVG con `role`/`aria-label`), ningún botón mudo, `prefers-reduced-motion` atendido en `landing.css` y en `PlanoIsometrico.tsx:123`, el plano toma foco (`tabIndex`) y escucha teclado, y la rueda **no secuestra el scroll** hasta que alguien toca el plano (`armado`, `PlanoIsometrico.tsx:306-316`) — que es el error clásico de un plano en un hero. | L15, L16 |

**Hallazgos abiertos: 1 mayor (H-1, test rojo), 2 menores (H-2, H-3), 2
observaciones (H-4, H-5).**

---

## H-1 (MAYOR, test ROJO) — `/` baja three.js antes de pintar el titular

`test_l17_el_primer_pintado_de_la_portada_no_arrastra_three_js` **FALLA**, a
propósito y con esta salida:

```
`/` es ahora una página pública y su bundle inicial trae
['@react-three/drei', '@react-three/fiber', 'three'] por el camino de
['frontend/src/components/StoreEditor3D/StoreEditor3D.tsx']: el 3D deja de ser
«bajo demanda» y el LCP en 4G no se sostiene. Falta un `React.lazy` sobre el
tablero en App.tsx (la landing ya carga su Vista3D con `import()`).
```

**Qué pasa.** Vite parte el bundle **sólo** donde hay un `import()` dinámico.
El grafo estático desde `frontend/src/main.tsx` tiene hoy 67 módulos locales, y
entre ellos está `components/StoreEditor3D/StoreEditor3D.tsx`, que importa
`three`, `@react-three/fiber` y `@react-three/drei` de forma normal
(`StoreEditor3D.tsx:2-12`). El camino es
`main.tsx → App.tsx → pages/Dashboard.tsx → … → StoreEditor3D.tsx`. Como
`App.tsx:4` también importa `Landing` estáticamente, **el visitante anónimo de
`/` baja el motor 3D entero, el editor y el SDK de Firebase antes de ver el
hero**, y el `lazy(() => import("./Vista3D"))` de la landing no ahorra un solo
byte, porque `three` ya vino en el chunk principal.

Reproducción sin build (el mismo recorrido que hace el test):

```
cd /tmp/retail-espacios-test/backend
python -m pytest tests/test_landing_ataques.py::test_l17_el_primer_pintado_de_la_portada_no_arrastra_three_js
```

**Por qué es de frontera y no de gusto.** Es el guardrail literal de la fase
—«three.js ya existe y se carga SOLO bajo demanda para "Ver en 3D"»— y el
`LCP < 2,5 s en móvil 4G` del checklist del Verificador. Medir el LCP con este
bundle no va a dar; el problema es de grafo, no de milisegundos.

**Dónde se arregla (NO es territorio del auditor, y NO es de la landing):** en
el armazón, con `React.lazy` + `<Suspense>` sobre lo que sólo hace falta con
sesión — `Dashboard` primero (es el que arrastra `three`), y con el mismo gesto
`Login` (que arrastra `@firebase/auth`), `Plataforma`, `DetalleCliente` y
`ReportePlataforma`. La landing ya está del lado correcto: es el único archivo
del proyecto que hoy usa `lazy()`. El test se pone verde solo cuando `three`
deja de ser alcanzable estáticamente desde `main.tsx`.

**Si el dueño decide aceptar el peso** (es una decisión de producto legítima:
son ~600 KB para un visitante y el tablero los quiere igual), la conversión es
de una línea: cambiar la aserción de L17 por `pytest.xfail(strict=True)` con el
motivo escrito. No la borren: es la única prueba que vigila que el 3D siga
siendo bajo demanda.

---

## H-2 (menor) — `robots: index, follow` vale para TODA la aplicación

`frontend/index.html:18` declara `<meta name="robots" content="index, follow">`,
y el catch-all del backend (`app/main.py:396-404`) devuelve **200 + el mismo
HTML** para cualquier path. Medido:

```
/robots.txt   200 text/html  1077 B
/sitemap.xml  200 text/html  1077 B
/no-existe    200 text/html  1077 B
```

Consecuencias: (a) no hay forma de decir «no indexes `/plataforma` ni
`/login`», porque la etiqueta viaja en el mismo cascarón; (b) cualquier URL
inventada es un *soft-404* indexable con el título y la descripción de la
landing; (c) `/robots.txt` contesta HTML, así que un crawler que lo pida no
obtiene reglas sino la portada.

No es una regresión de esta fase (sin la etiqueta el comportamiento por defecto
también es indexar), pero **la fase es la que vuelve pública la puerta**.
Arreglo barato y sin backend: `frontend/public/robots.txt` (Vite lo copia a
`dist/` y la rama `file.is_file()` del catch-all lo sirve tal cual) con
`Disallow: /plataforma`, `/login`, `/reporte-plataforma` y `Allow: /`. El token
de invitación y el de montaje viajan en la *query*, que no se indexa sola, pero
tampoco conviene invitar al crawler a esas rutas.

---

## H-3 (menor) — el CTA «Hablemos» abre un correo sin destinatario

`frontend/src/pages/Landing/Landing.tsx:733`: `<a class="btn btn--primary"
href="mailto:">`. Está hecho a propósito (el comentario de arriba lo dice: el
correo de contacto es el `[COMPLETAR]` de la spec §7), y la decisión de no
inventar una dirección es la correcta. Pero **tal como está, el botón primario
de la sección de precio abre un compositor vacío**: para quien lo toca es un
error de la página, no un pendiente del dueño. Mientras no haya dirección, mejor
que el botón no sea un `mailto:` — un texto plano, o el enlace a `/login#registro`.

Es el único `[COMPLETAR]` que queda en la superficie visible: **precio** y
**correo de contacto** siguen sin definir y son del dueño, no de ningún agente.

---

## H-4 (observación) — `MercaFresco` sigue nombrado en un comentario

`frontend/src/pages/Landing/datos.ts:2`: `MercaFresco — el supermercado de
EJEMPLO de la landing`. **Hoy no llega al navegador** (Vite borra comentarios, y
el nombre no aparece en ninguna cadena renderizada: la landing rotula
«Supermercado de ejemplo»), por eso L05 pasa: el detector mira el código sin
comentarios, como el bundle.

La razón de tenerlo en la lista negra igual: `MercaFresco` **ya identifica a un
cliente adentro del producto** — es el cliente de las capturas de la consola del
operador (`features/tendencia/outputs/ENTREGA.md:145`, `tend-mf-claro.png`,
«MercaFresco con jun-26 suprimido por K=3»). Un nombre que ya está en uso
adentro no sirve como ficción afuera: el día que alguien lo suba de comentario a
constante para rotular el plano, la landing va a estar afirmando en público
—con cánones y proveedores inventados— algo sobre un nombre que en las
pantallas internas es un cliente. `copy.md` §13 lo propuso creyendo que era sólo
un fixture; conviene renombrarlo también en el comentario y en `copy.md` por uno
que no aparezca en ningún otro lado del repositorio.

L05 lo bloquea si alguna vez pasa a código renderizado.

---

## H-5 (observación) — dos anclas muertas hacia la política de datos

`Landing.tsx:687` enlaza `/politica-datos#transparencia` y `Landing.tsx:797`
`/politica-datos#derechos`. La página de política se pinta con
`renderMarkdownLite(politicaMd)` (`pages/PoliticaDatos.tsx:38`) y
`src/legal/markdownLite.tsx` **no emite `id=` en los encabezados**: los dos
enlaces abren la política correctamente pero aterrizan arriba de todo, en un
documento largo. Se arregla poniendo `id` derivado del texto en los encabezados
de `markdownLite` (territorio del builder de compliance/legal, no de la landing)
o apuntando a `/politica-datos` a secas.

---

## El archivo de ataque

`backend/tests/test_landing_ataques.py` — 28 pruebas, 1.172 líneas. No repite
nada de las suites anteriores (barridos de frontera del operador, saneo de
proveedor, K=3): sólo bordes que nacen con la landing.

| # | Ataca | Qué haría fallar |
|---|---|---|
| **L00** | **La prueba de la prueba.** Le pasa a cada detector una muestra que TIENE que encender y texto inocente que no. | Un patrón mal escrito, o el borrador de comentarios comiéndose el código: la auditoría entera pasaría en verde sin mirar nada. |
| **L01** | `/api/*`, `useAuthStore`, `useFixtureStore`, `Authorization`/`Bearer`, `withCredentials`, la llave `retail-auth-v1`, `import` de `api/*` y `store/*`. | Una llamada autenticada o una lectura de sesión desde la portada. |
| **L02** | El **rebote**: los módulos preexistentes que la landing importe se auditan con la misma vara. | Reusar un componente del tablero que adentro habla con la API. |
| **L03** | `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket`, `sendBeacon`. | El plano servido por archivo en vez de sembrado: un lugar más donde mañana alguien vuelca un export real. |
| **L04** | `dangerouslySetInnerHTML` / `.innerHTML =`. | XSS en la pantalla más pública, y `<script>` inline que la CSP bloquea. |
| **L05 / L05b** | Nombres del registro de producción; huellas de export real (UUID, `clienteSlug`, `leaseId`, `supplierId`, correos de dominio real). | Un plano «de ejemplo» que en realidad salió de una base. |
| **L06** | `<script src>`, `<link href>`, `@import`, `url()`, `<img src>`, `import()` y `@font-face` externos + lista blanca de hosts. | Una fuente o una imagen de CDN: se ve bien en dev y se cae en producción. |
| **L07** | `<script>` inline y manejadores `on*=` en `frontend/index.html`; `lang="es"`. | Copiar el conmutador de tema del prototipo tal cual. |
| **L08 / L08b** | La CSP del backend, directiva por directiva, y la cabecera en la respuesta de `/`. | Aflojar `img-src`/`script-src` «para que la landing se vea linda». |
| **L09 / L10 / L10b** | `/` anónimo; los nueve enlaces que ya circulan; que el cascarón sea **el mismo** para todos. | Un 404, un redirect, una cookie o render en el servidor. |
| **L11** | El ORDEN de las guardas de `App.tsx`: montaje y `/politica-datos` antes que la landing. | Que el enlace de la mercaderista caiga en la portada con el token ya consumido de la URL. |
| **L12a / L12b** | Que la landing esté **acotada a la raíz** y que `<Login/>` siga en el camino sin sesión; que la portada tenga `/login` y `/login#registro`. | Que `/login?invitacion=…` o `/reporte-plataforma` terminen en la página de marketing. |
| **L13** | Barrido de toda la tabla de rutas: qué `GET /api/*` contesta 200 sin token. | Un endpoint público nuevo para alimentar el plano. |
| **L14** | El grafo **estático** de la landing (lo alcanzable sólo por `import()` está exento) + que exista de verdad un `import()` del módulo 3D. | Que «Ver en 3D» sea un `import` normal. |
| **L15 / L16** | `alt`, botones con nombre accesible, `prefers-reduced-motion`, `role`/`aria-label` del plano, foco y teclado donde hay rueda y arrastre. | Un plano que sólo existe para quien tiene mouse y vista. |
| **L17** | El grafo estático desde `main.tsx`: `three`/`@react-three/*` en el primer pintado de `/`. | **H-1.** |

Dos decisiones de ingeniería del archivo, por si alguien lo toca después:

* **El borrador de comentarios es un escáner, no una expresión regular.** Este
  repositorio comenta muchísimo y en español; buscar `/api/` o `galerias` sobre
  el texto crudo daría una alarma por cada comentario que **explica** que eso no
  se hace. Y con regex la limpieza sale mal de una forma que además pasa
  desapercibida: `App.tsx` tiene `/api/plataforma/*` adentro de un comentario de
  línea, y ese `/*` abre un bloque que la regex cierra cincuenta líneas más
  abajo, borrando —entre otras cosas— la guarda `if (TOKEN_MONTAJE) return
  <Montaje />` que L11 vigila. Se recorre carácter por carácter, respetando
  cadenas. L00 tiene esa trampa exacta como caso.
* **Los archivos de la landing se descubren con git, no adivinando nombres.**
  `git diff --diff-filter=A` contra la base de la rama (la más nueva entre
  `origin/main` y `main`; el `main` local de esta copia está en la Fase 4) más
  lo no rastreado, unido a todo lo que se llame «landing». Sólo lo **agregado**:
  un archivo viejo que la fase tocó —`App.tsx`— sigue siendo el armazón con
  sesión y auditarlo con la vara de la landing daría una alarma por cada
  `useAuthStore`, que es justo lo que ese archivo tiene que hacer. El cableado
  se audita aparte, en L11 y L12a.

---

## Salida de pytest

Corrida final, contra el árbol completo, sólo este archivo (REGLA_VERIFICACIÓN:
la suite entera y el build los corre el Verificador):

```
cd /tmp/retail-espacios-test/backend
TMPDIR=/tmp/pt-landing python -m pytest tests/test_landing_ataques.py -p no:randomly

..s.......................F..                                            [100%]
FAILED tests/test_landing_ataques.py::test_l17_el_primer_pintado_de_la_portada_no_arrastra_three_js
1 failed, 27 passed, 1 skipped, 2 warnings in 8.46s
```

* **El `F` es H-1** y está explicado arriba: es el hallazgo, no un test roto.
* El `s` es L02 (la landing no importa **ningún** módulo preexistente, así que
  no hay rebote que auditar — es el mejor resultado posible para esa prueba).
* Las 2 warnings son de terceros (`StarletteDeprecationWarning` del `TestClient`).

`cd /tmp/retail-espacios-test/frontend && npx tsc --noEmit` → **limpio**, sin
salida. No se corrió `npm run build` (borra `frontend/dist`, que los tests de
ruta montan) ni la suite completa de backend.

---

## Huecos declarados (lo que esta auditoría NO puede afirmar)

1. **LCP real.** No se midió con navegador; lo que se midió es el grafo del
   bundle, que es la causa de H-1. La medición con Lighthouse (o equivalente,
   móvil 4G) es del Verificador, y conviene hacerla **después** de resolver H-1
   o el número no significa nada.
2. **CSP en vivo.** Las violaciones de CSP se comprueban acá leyendo archivos.
   Que la consola del navegador quede sin un solo renglón rojo en `/` —claro,
   oscuro, móvil y escritorio— sigue siendo del Verificador.
3. **`frontend/dist` está viejo.** Las pruebas de ruta (L09–L10b) usan el `dist`
   que hay en el árbol, construido antes de esta fase: prueban el **contrato del
   servidor** (200, `text/html`, mismo cascarón, CSP, sin cookie), no el HTML
   final de la landing. Cuando el Verificador construya, conviene además hacer
   un `grep` de los nombres del registro sobre `dist/assets/*.js`: es la única
   forma de comprobar lo mismo que L05 sobre el artefacto que de verdad se sube.
   (No lo hice yo: correr `npm run build` borra el `dist` que estos tests montan
   y me pisaría con los otros agentes.)
4. **Comportamiento en el navegador.** Que `/` sin sesión pinte la landing y con
   sesión redirija como siempre se verificó **estáticamente** (orden de guardas
   en `App.tsx` + el cascarón por HTTP). El clic, el arrastre, la pinza, la
   ficha al pasar el mouse y el «Ver en 3D» no se ejercitaron en un navegador
   real desde este territorio; el frontend dejó `npm run probar:landing`
   (render con `react-dom/server`) para esa mitad.
5. **Precio y correo de contacto** siguen en `[COMPLETAR]` (spec §7). Son del
   dueño. H-3 sólo pide que, mientras tanto, el botón no simule funcionar.
6. **El copy contra el producto.** Que la landing no prometa nada que RECABRA no
   haga es un contraste contra `docs/ESTADO.md` que corresponde al Verificador;
   acá sólo se verificó que no nombre clientes reales ni cifras de la consola
   del operador.

---

## Lo que NO se tocó

`backend/app/**`, `frontend/src/**`, `frontend/index.html`,
`frontend/package.json`, ningún test de otro agente, ningún archivo de
`features/landing/outputs/` que no sea este. Ninguna aserción se aflojó para
dejar la suite verde: la única roja es un hallazgo con nombre, causa, archivo y
arreglo de una línea.
