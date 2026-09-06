# Landing de RECABRA — frontend construido

Insumos: `features/landing/spec.md` (vinculante), `outputs/copy.md` (el texto, literal),
`outputs/diseno.md` + `outputs/prototipo/index.html` (la estética y el movimiento).

Lo que sigue es lo que quedó en el código, qué se decidió cuando el diseño nuevo chocó con
la aplicación de adentro, y qué queda abierto. **Nada de esto está commiteado**: los
archivos están en la rama `claude/fase-9-landing`, sin commit ni push.

---

## 1. Qué se construyó

### Archivos nuevos

| Archivo | Qué es |
|---|---|
| `frontend/src/pages/Landing/Landing.tsx` | La página entera: nav, hero, «Lo que hace», perfiles y cifras, los tres pasos, la banda de asesoría, confianza, precio, CTA final y pie. Todo el texto es el de `copy.md`, literal. |
| `frontend/src/pages/Landing/landing.css` | Los tokens y los componentes del diseño «Planta y tinta», **enteros bajo `.lp`** (ver §4). Sin fuentes, sin imágenes, sin `@import`. |
| `frontend/src/pages/Landing/datos.ts` | El supermercado de ejemplo: 16 espacios alquilables (10 CENTRO / 6 PALMAS), ~30 muebles de contexto, dos pisos. Datos inventados, sembrados en el código. |
| `frontend/src/pages/Landing/PlanoIsometrico.tsx` | El plano interactivo: SVG propio, zoom, arrastre, pinza, teclado, ficha, leyenda, tabla equivalente y límite de error. |
| `frontend/src/pages/Landing/Vista3D.tsx` | La vista 3D con three.js. **Es el único archivo de la landing que importa `three`**, y entra por `React.lazy` + `import()`. |
| `frontend/scripts/probar-landing.mjs` | 21 pruebas: renderiza la landing de verdad con `react-dom/server` y verifica copy, datos, aislamiento del CSS y el import perezoso. |
| `backend/tests/test_landing.py` | 11 pruebas: `/`, `/login`, `/login?invitacion=`, `/politica-datos` y el deep link de montaje siguen sirviendo la aplicación sin sesión; el SEO viaja en el HTML; `/api/*` desconocido sigue siendo 404 JSON. |

### Archivos tocados

| Archivo | Cambio |
|---|---|
| `frontend/src/App.tsx` | Ruteo sin sesión (§2) + **todas las pantallas de adentro pasan a `React.lazy`** (§5). |
| `frontend/src/pages/Login.tsx` | Tres líneas: `/login#registro` abre el formulario en modo registro. Nada más se tocó. |
| `frontend/index.html` | `<title>`, `description`, `robots`, Open Graph y `twitter:card` del copy §1. |
| `frontend/package.json` | `npm run probar:landing`, sumado a `npm run probar`. |
| `docs/ESTADO.md` | Una regla dura nueva: «`/` es pública; el ingreso vive en `/login`». |

---

## 2. Rutas: qué cambió y qué NO se rompió

Sin sesión, `App.tsx` decide en este orden —el mismo de antes, con un escalón nuevo al
final—:

1. `/politica-datos` → `PoliticaDatos` (pública, se resuelve antes que nada).
2. Enlace de montaje (`/?montar=CODE&t=TOKEN` → `?montaje=1`) → `Montaje`. **Manda sobre
   la landing**: la mercaderista nunca ve la portada aunque su enlace caiga en `/`.
3. `/` (o `""`, o `/index.html`) → **`Landing`** ← lo nuevo.
4. **Cualquier otra ruta** → `Login`, como siempre.

El punto 4 es deliberado y no es «la ruta vieja por si acaso»: es lo que hace que un
enlace guardado a `/reporte-plataforma` termine en esa pantalla después de entrar, en vez
de perderse en la portada. `/login` cae ahí igual que antes.

Intactos, con prueba que lo fija:

- `/login?invitacion=…` — el destino del correo de invitación (`routers/usuarios.py:122`).
  El canje sigue pasando en el backend por correo; `Login` no lee el parámetro y no lo
  necesita.
- El deep link de montaje y el `?montaje=1` que deja en la barra.
- `/politica-datos` y `/politica-datos#derechos`.
- `/plataforma` y la redirección del operador; la de quien ya tiene sesión no se tocó.
- Después de entrar desde `/login`, el `*` del router manda a `/` → tablero. Igual que ayer.

Nuevo, chico: **`/login#registro`** abre el formulario en modo registro. Es el destino de
los dos CTA primarios de la landing. Sin el ancla, «Crear mi cuenta» aterrizaba en
«Ingresar», que es exactamente el tropiezo que la landing venía a evitar.

---

## 3. El plano isométrico

Proyección 2:1 (`sx = (x−y)·U`, `sy = ((x+y)·0,5 − z·0,66)·U`, `U = 13`), la misma familia
que usa `FloorPlan2D` para el mapa de sede, con el escorzo que fijó el diseño. Cada mueble
son tres polígonos (cara superior, izquierda, derecha) con los tres tonos de su estado;
contorno con `vector-effect: non-scaling-stroke`, así no engorda al acercar.

- **Se calcula una sola vez.** Los ~140 polígonos se arman en un `useMemo` de módulo; el
  paneo y el zoom son **un solo `transform` sobre el `<g>` de cámara**, escrito por `ref`,
  sin re-renderizar React. Arrastrar no cuesta un repintado del árbol.
- **Gestos:** rueda (zoom al puntero, 1,14 por paso, límites 0,5×–4,5×), arrastre 1:1,
  pinza de dos dedos, botones `+` / `−` / `Centrar`.
- **La rueda se arma con el primer clic o foco** y se desarma al salir del panel: mientras
  no lo tocaste, la rueda hace scroll de la página. Un plano en un hero no puede
  secuestrar el scroll. En táctil, `touch-action: pan-y` deja que el deslizamiento
  vertical siga siendo scroll.
- **Teclado:** flechas panean, `+`/`−` acercan, `Home` centra, `Esc` cierra la ficha; `Tab`
  recorre los 16 alquilables y cada uno abre su ficha al recibir el foco, con el contorno
  en ultramar a 2,4 px.
- **Ficha** con el orden exacto del copy §11.2 y las cuatro variantes de estado; en ≤ 720 px
  deja de flotar y pasa a hoja fija abajo con botón `Cerrar`.
- **El primer gesto se enseña solo:** a los 700 ms se abre la ficha de `PUN-02` y la pieza
  da dos pulsos. Con `prefers-reduced-motion`, se abre de inmediato y sin pulso.
- **Accesible sin el dibujo:** `aria-label` del marco, `<figcaption>` con la descripción
  larga (visualmente oculta, referenciada por `aria-describedby`), cada mueble anunciado
  como «código, tipo, sede, estado», leyenda con la palabra al lado del color y un
  `<details>` con la **tabla equivalente** de seis columnas.
- **Si el plano se cae**, un límite de error muestra «No pudimos dibujar el plano de
  ejemplo. El resto de la página funciona igual.» con `Reintentar`; la leyenda, la nota de
  «datos inventados» y la tabla siguen ahí, porque viven afuera del límite.

Datos: los 16 espacios, los proveedores inventados y las reglas de escena de `copy.md` §13,
tal cual (7 libres / 3 se liberan / 6 tomados, `GON-04·A` roja y `GON-04·B` verde en la
misma corrida, el gris en mayoría, prefijos reales de `nomenclatura.ts`).

---

## 4. «Ver en 3D» — y en qué se apartó del prototipo

**Se hizo con three.js de verdad, no con la isometría movida.** El prototipo de diseño
simulaba el 3D interpolando la misma proyección SVG (§4.4 de `diseno.md`, decisión abierta
n.º 3), pero tanto la spec como el encargo de esta fase piden three.js bajo demanda; se
siguió la spec y quedó anotado acá para que el dueño lo decida sabiendo qué se ganó y qué
se perdió.

- `PlanoIsometrico` hace `lazy(() => import("./Vista3D"))` y, al tocar el botón, dispara el
  `import()` con el botón deshabilitado diciendo **`Cargando la vista 3D…`** — el mismo
  estado y el mismo texto que había especificado el diseño, sólo que la espera ahora es
  real y no simulada.
- `Vista3D.tsx` **no usa `StoreEditor3D`**: ese arrastra `@react-three/fiber`, `drei`, el
  store de muebles y llamadas a `/api/*`, y esta página es pública. Es una escena mínima
  escrita a mano: cajas para los muebles (lo alquilable con su color, el contexto apagado
  al 42 %), dos luces, cámara orbital propia (sin `OrbitControls`), arrastre para girar,
  rueda/pinza para acercar, flechas y `+`/`−` por teclado, `Esc` para volver.
- **Se pinta a pedido**, no en un bucle de `requestAnimationFrame`: quieta, la escena no
  gasta un frame. Es lo que la hace aceptable en un celular y bajo `prefers-reduced-motion`.
- Los tres estados de error del copy §11.4 están: no se pudo cargar el chunk, el navegador
  no soporta WebGL (incluye `webglcontextlost`), y en los dos casos la acción es `Volver al
  plano`. Al desmontar se liberan geometrías, materiales y el renderer.
- **Lo que se perdió:** la coreografía de cámara de 700 ms del prototipo (el piso que se
  aplasta, los alquilables que crecen, el gris que se apaga). Volver a ella es borrar el
  `import()` y animar cuatro números; está descrito en `diseno.md` §4.4.

---

## 5. Rendimiento: el arreglo que estaba fuera de la landing

La landing no importa `three` por ningún lado, pero eso **no alcanzaba**: Vite parte el
bundle sólo donde hay un `import()`, y `main.tsx → App.tsx → Dashboard → StoreEditor3D`
metía `three`, `@react-three/fiber` y `@react-three/drei` en el chunk principal. El
visitante anónimo de `/` bajaba el motor 3D entero antes de leer el titular, y el
`import()` de la vista 3D no ahorraba un solo byte.

Por eso **todas las pantallas de adentro pasaron a `React.lazy` en `App.tsx`** (`Dashboard`,
`Login`, `Montaje`, `PoliticaDatos`, `Plataforma`, `ReportePlataforma`, `DetalleCliente`),
con una frontera `<Suspense>` que muestra el fondo de la aplicación mientras baja el chunk.
La landing es lo único que se importa de forma estática: su LCP es un `<h1>` que no puede
esperar a un chunk. De paso, el SDK de Firebase (que cuelga de `Login`) también dejó de
viajar en el primer pintado.

Es un cambio en el armazón de la aplicación, no en la landing: **el Verificador debería
mirar a mano el login, el tablero, `/plataforma` y el enlace de montaje**, que ahora entran
por un chunk aparte. Lo detectó `backend/tests/test_landing_ataques.py::test_l17…`, del
auditor de frontera, que hoy pasa.

Lo demás del presupuesto de rendimiento, tal como lo fijó el diseño: cero fuentes propias
(tipografía del sistema), cero imágenes, todo el arte en SVG/CSS en línea, el panel del
plano con `aspect-ratio` reservado (CLS ≈ 0) y revelado por `IntersectionObserver` en vez
de escuchar `scroll`.

---

## 6. Aislamiento del CSS (por qué todo cuelga de `.lp`)

`landing.css` redefine `--bg`, `--surface`, `--ink`, `--line`, `--accent`, `--r-*`,
`--shadow-*`… que son **los mismos nombres** que usa `src/index.css` para la aplicación de
adentro, y clases genéricas (`.card`, `.nav`, `.btn`, `.rotulo`, `.tool`, `.mini`, `.tag`)
que ahí significan otra cosa. Si un selector se escapara, repintaría el tablero.

Solución: **todas** las reglas cuelgan de `.lp` (la raíz de la landing) o de
`html.lp-activa` (las dos que pintan el fondo de la página mientras la landing está
montada, y que se limpian al desmontar). Hay una prueba que recorre el archivo, extrae cada
selector —también los de adentro de un `@media`— y falla si alguno no empieza por ahí.

---

## 7. Claro/oscuro, responsive y SEO

- **Tema:** lo resuelve React (preferencia guardada en `localStorage` > preferencia del
  sistema, y sigue al sistema en vivo mientras nadie elija) y lo escribe como
  `data-lp-tema` en la raíz de la landing y en el `<html>`. Dos juegos completos de tokens,
  incluida la banda de asesoría, que en oscuro se va más al negro para no perder el evento
  tonal. El conmutador está en la barra.
- **Responsive:** los cinco quiebres del diseño (639 / 759 / 1079 / 1399 / 1240 de
  contenedor). En 360 px todo va a una columna, la barra deja sólo el CTA primario, la
  ficha del plano pasa a hoja inferior con `Cerrar`, el plano es 4:3,4 y los controles
  crecen a 44 px en punteros gruesos. En 1920 la página **no se estira**: queda como una
  hoja de 1240 px centrada.
- **SEO:** título, `description`, `robots`, Open Graph y `twitter:card` en
  `frontend/index.html`, servidos en el HTML y no puestos por JavaScript — un cliente de
  correo o de WhatsApp no ejecuta nada. `lang="es"` ya estaba.

---

## 8. Decisiones que le quedan al dueño

Ninguna se suavizó: donde el diseño nuevo choca con la aplicación de adentro, quedó el
diseño nuevo y el choque anotado acá.

1. **La landing y la aplicación no se parecen.** La landing es papel cálido, ultramar de
   acción y **tipografía del sistema**; la aplicación es papel frío, acento tinta y Chivo +
   Archivo Narrow. Quien toca «Crear mi cuenta» aterriza en un `/login` que no se parece a
   la página de la que viene. O se lleva el login a los tokens de la landing, o se acepta
   el corte. (Es la decisión abierta n.º 1 de `diseno.md`, con la vuelta de tuerca de que
   ahora se ve en la misma sesión de uso.)
2. **`frontend/index.html` sigue bajando Chivo y Archivo Narrow de `fonts.googleapis.com`**
   para la aplicación de adentro. La CSP de Fase 3 ya lo permite, así que no rompe nada,
   pero **la landing paga una hoja de estilos externa que no usa**, y una hoja de estilos
   bloquea el primer pintado. Arreglarlo es sacar el `<link>` del HTML e inyectarlo desde
   JS cuando monta una pantalla que no sea la landing; no se hizo porque cambia cómo cargan
   las fuentes para todos los usuarios de adentro y eso nadie lo pidió. **Si el LCP en 4G
   queda ajustado, este es el primer lugar donde mirar.**
3. **El 3D es three.js de verdad** (§4), no la isometría del prototipo. Pesa un chunk y
   puede fallar en un equipo viejo; a cambio es 3D de verdad, como adentro del producto.
4. **El conmutador claro/oscuro quedó en la barra.** El diseño lo había puesto como
   comodidad de revisión. Si se prefiere seguir sólo al sistema, se borra el botón y la
   página sigue funcionando (el tema se resuelve igual).
5. **Las dos sedes en la misma lámina** (CENTRO grande, PALMAS asomando) y el nombre
   `MercaFresco` que no aparece escrito en ninguna parte visible: se respetó el diseño.
6. **Los `[COMPLETAR: …]` se ven.** Precio, unidad, correo de contacto, correo de
   protección de datos, razón social, NIT y ciudad están en la página como chips rayados,
   imposibles de pasar por alto. **La página no se despliega con ellos puestos**; el CTA
   `Hablemos` es un `mailto:` sin dirección hasta que el dueño la escriba.

---

## 9. Huecos declarados

1. **`og:image` no existe.** El copy pide una imagen local de 1200 × 630 px con el plano de
   ejemplo. En este entorno no hay navegador headless (ni Playwright, ni Puppeteer) para
   rasterizarla, y **no se puso una etiqueta apuntando a un archivo inexistente**: sin
   `og:image` el enlace compartido se ve como tarjeta chica; con una ruta rota, roto. Falta
   generarla y agregar `og:image` + `og:image:alt` (el texto ya está escrito en `copy.md` §1).
2. **Capturas y LCP medido.** No hay navegador en este entorno, así que las capturas de
   360 px y 1440 px en claro y oscuro y la medición de LCP (Lighthouse o equivalente en 4G
   simulado) quedan para el Verificador o para una corrida local con `npm run dev`. Lo que
   sí se verificó acá es que la página **se dibuja**: se renderiza con `react-dom/server` y
   se le busca el copy adentro.
3. **La separación real del chunk de three.js la confirma el build.** Acá se verificó por
   el grafo estático (el `import()` está, y `three` no aparece en el grafo que cuelga de
   `main.tsx`). En el `npm run build` del Verificador tiene que aparecer un chunk propio con
   `three` adentro y **no** dentro del `index-*.js`.
4. **No hay `vitest` en el frontend.** Las pruebas se escribieron en el estilo que ya usa el
   repo (`frontend/scripts/probar-*.mjs`, con esbuild), más las de backend. Montar vitest
   sería una decisión de infraestructura que excede esta fase.
5. **El texto del copy entró completo, sin recortes.** No hizo falta pedirle a copy que
   acortara nada.

---

## 10. Cómo verificar

```bash
# tipos (limpio)
cd frontend && npx tsc --noEmit

# la landing: 21 pruebas (render real + datos + aislamiento del CSS + import perezoso)
cd frontend && npm run probar:landing

# rutas públicas y SEO servido: 11 pruebas
cd backend && python -m pytest tests/test_landing.py

# la auditoría de frontera de la landing (la escribió el agente auditor): 28 pruebas
cd backend && python -m pytest tests/test_landing_ataques.py

# mirarla
cd frontend && npm run dev   # y abrir "/" sin sesión
```

Estado al cerrar esta tarea: `tsc --noEmit` limpio; `probar:landing` 21 en verde;
`test_landing.py` 11 en verde; `test_landing_ataques.py` 27 en verde + 1 salteada, sin
fallas. **No se corrió la suite completa ni `npm run build`**: los corre el Verificador, una
vez y en serie, como pide la regla de verificación.
