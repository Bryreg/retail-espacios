# Red team — segunda ronda: la frontera del vestido **E · La fusión**

**Auditor adversarial de frontera.** Territorio: `backend/tests/test_landing_ataques.py`
(mío, de la ronda anterior; pasa de 1.172 a **1.952 líneas**, +9 ataques
**L18–L26**) y este informe. **Acá no se arregla código de producción:** ni una
línea de `frontend/src`, ni de `backend/app`, ni del prototipo. Un defecto se
fija con una prueba que lo demuestra y se cuenta acá con archivo:línea y
arreglo.

Primera ronda: `features/landing/outputs/auditor-frontera.md` (L00–L17). **Todo
lo que dice ese informe sigue vigente y sigue verde**, y su hallazgo mayor
(H-1) está arreglado. Esto es lo que se suma por el re-vestido con la opción
**E** (`features/landing/outputs/opciones/E-fusion/`).

**Trabajo en paralelo, y se nota en este informe.** El frontend estaba
portando E mientras esta ronda corría. Empecé contra la landing con el vestido
anterior, escribí los nueve ataques calibrándolos **contra el prototipo de E**
(la misma lógica corrida sobre `opciones/E-fusion/index.html` da verde en los
nueve: no son mi opinión sobre E, son E escrita como prueba), y el port fue
aterrizando mientras tanto —`Landing.tsx` reescrito, `PlanoIsometrico.tsx` con
el mapa de escenas, `motor.ts` y `Miniaturas.tsx` nuevos, y por último
`landing.css`—. **Los tres defectos que encontré se cerraron ahí mismo**, y los
dejo contados igual: son el registro de qué se verificó, con qué salida falló,
y qué prueba lo va a volver a atrapar el día que alguien lo deshaga.

**Al cerrar, la suite entera está verde.** Ninguno de los tres es un
«pendiente»; los tres son un guardrail que ahora existe.

---

## Veredicto de esta ronda

| Borde que abre E | Respuesta | Evidencia |
|---|---|---|
| **La cámara por scroll, ¿traba la página o repinta React?** | **No.** `PlanoIsometrico.tsx` escucha `scroll` con `{ passive: true }`, anima con `requestAnimationFrame` y guarda el encuadre en `useRef` (`cam`, `tgt`, `base`, líneas 146-151), no en `useState`. Es la trampa que el propio README de E marca: «no poner la cámara en `useState`: serían 60 renders del árbol por segundo». | **L19** verde |
| **Con `prefers-reduced-motion`, ¿se pierde alguna PRUEBA?** | **No.** Cero `display:none` / `visibility:hidden` / `opacity:0` sobre contenido dentro de un bloque de movimiento reducido —lo único apagable es adorno: pseudo-elementos, `.deco`, `.pulse`—, existe la **versión quieta** (`landing.css:722-730` devuelve `opacity:1` y `transform:none`), y del lado del JS ninguna capa se deja de pintar por la preferencia. | **L20** verde |
| **¿El vidrio se apaga bajo 720 px?** | **Sí.** `landing.css:891-897`: las cinco superficies de vidrio pasan a `backdrop-filter: none` con fondo sólido bajo 720 px, y la barra superior baja a `blur(12px)`. Antes del re-vestido no había ningún corte: ver **E-2**. | **L21** verde |
| **¿Los prototipos entregados bajan algo de afuera?** | **No.** Los seis `.html` de `features/landing/outputs/` (prototipo + opciones A–E) no tienen `<script src>`, `<link>`, `@import`, `url()` ni `@font-face` externos; los únicos hosts escritos son `www.w3.org` (namespace) y `retail-espacios.onrender.com` (og:url). Cero `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` y cero `/api/*`. La promesa del README de E («un solo archivo, cero llamadas de red») se cumple. | **L22** verde |
| **¿Aparece un cliente del registro en los archivos nuevos?** | **No.** Ni `galerias`, ni `Galerías Plaza`, ni `TERRON`, ni `NAVE`, ni `POBLADO`, ni `ciudad jardín` — ni en los entregables ni en el código nuevo (`motor.ts`, `Miniaturas.tsx` incluidos). `MercaFresco` queda declarado como ficción aprobada de `copy.md` §13; ver **O-1**. | **L05, L05b, L22b** verdes |
| **¿Los conectores y los rótulos inventan copy?** | **Ya no.** Los seis conectores dicen el título **literal** de la sección siguiente y los rótulos son `01 / LO QUE HACE` … `06 / PRECIO`; todo verificado carácter por carácter contra `copy.md`. Antes del port había uno inventado: ver **E-3**. | **L23** verde |
| **¿La barra de progreso le habla al lector de pantalla?** | **No.** `Landing.tsx:364` la envuelve en `aria-hidden="true"` y no hay `aria-live` en ningún lado de la barra. | **L24** verde |
| **¿El H1 es «Recabrá cada metro.»?** | **Sí, y es uno solo** (`Landing.tsx:380`), con el titular viejo bajado a subtítulo con las cuatro palabras pintadas. Antes del port no lo era: ver **E-1**. | **L18** verde |
| **¿«Ver en 3D» sigue siendo un chunk aparte?** | **Sí.** `lazy(() => import("./Vista3D"))`, `Vista3D.tsx` es el único archivo que toca `three`, el archivo que pinta el botón no lo importa estáticamente, y el microcopy de `copy.md` §11.1 está completo, «Cargando la vista 3D…» incluido. `main.tsx` tampoco lo arrastra. | **L14, L17, L25** verdes |
| **¿Los encuadres apuntan a muebles que existen?** | **Sí.** Todas las claves `SEDE/CÓDIGO` del mapa de escenas y de las capas ancladas están en los datos sembrados, y las sedes son las dos declaradas. | **L26** verde |

**Estado de la suite al cerrar:** 39 pruebas — **38 verdes, 1 hueco declarado
(G-5), 0 rojas.** Al empezar eran 3 rojas.

---

## E-2 (MAYOR — **cerrado durante la ronda**) — el vidrio no se apagaba en el teléfono

`test_l21_el_vidrio_se_apaga_en_pantallas_chicas`
(`backend/tests/test_landing_ataques.py:1528`). Rojo al empezar, verde al
cerrar. Fue el último en caer: llegó con el re-vestido de `landing.css`.

```
la landing usa `backdrop-filter` (frontend/src/pages/Landing/landing.css)
y no lo apaga en ningún corte de 720 px o menos.
```

**Qué pasa.** `landing.css:206` (`.lp .nav`) pinta la barra superior con
`backdrop-filter: blur(14px) saturate(1.3)`, y la hoja no tiene ninguna regla
que lo apague en pantallas chicas. Cada superficie con `backdrop-filter`
obliga al compositor a releer y desenfocar lo que hay detrás **en cada
cuadro**. Hasta el vestido anterior se notaba poco. **Con la cámara de E eso
cambia de categoría:** el plano se repinta 60 veces por segundo debajo de la
barra mientras la persona baja, y el desenfoque se recalcula 60 veces por
segundo encima. En un Android de gama media —que es el teléfono con el que un
gerente de supermercado abre esto— la página se traba justo mientras intenta
demostrar que es fluida. Y E suma vidrio: tarjetas, mini-planos, pasos, la sala.

La regla es de la propia opción E, heredada de C: «el vidrio moderado y
**apagado bajo 720 px**» (`E-fusion/README.md`, «Qué tomé de C» §7). Y el
vestido nuevo multiplica la superficie: donde antes había una sola barra de
vidrio, ahora hay tarjetas, mini-planos, pestañas, pasos y la sala.

**La prueba pide tres cosas, ninguna caprichosa:**

1. que exista un corte ≤ 720 px donde el vidrio se apague de verdad
   (`backdrop-filter: none`);
2. que en **esa misma regla** se ponga `background` sólido — un panel que era
   legible *gracias* al desenfoque y se queda sin desenfoque y sin fondo pasa a
   ser texto directamente sobre el plano;
3. que lo que quede con vidrio bajo 720 px sea liviano (≤ 12 px de blur), para
   que la barra superior pueda seguir siendo de vidrio sin costar lo mismo.

E cumple las tres, y así quedó en la hoja portada (`landing.css:891-897`, el
mismo bloque que `E-fusion/index.html:740-743`):

```css
@media (max-width: 720px) {
  .lp .glasscard, .lp .mini, .lp .rtab, .lp .paso,
  .lp .sala { backdrop-filter: none; -webkit-backdrop-filter: none;
              background: var(--panel-solid); }
  .lp .rail__in { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
}
```

**Queda la prueba.** Es el defecto más fácil de reintroducir de los tres: el
vidrio se agrega tarjeta por tarjeta, en un `.css` de 900 líneas, y nadie mira
el bloque de 720 px al hacerlo.

---

## E-1 (MAYOR — **cerrado durante la ronda**) — el H1 no era el slogan

`test_l18_el_titular_es_el_slogan_de_marca_y_el_viejo_no_se_perdio`
(`test_landing_ataques.py:1326`). Rojo al empezar, verde al cerrar.

```
el <h1> de frontend/src/pages/Landing/Landing.tsx dice
'Qué mueble está libre, quién lo ocupa, a cuánto y hasta cuándo.'
y el dueño eligió 'Recabrá cada metro.'
```

**Por qué es de frontera y no de gusto.** El `<h1>` es tres cosas a la vez: el
LCP de la página, el título que Google publica en el resultado de búsqueda y el
«título del documento» que anuncia un lector de pantalla. El dueño ya lo había
decidido (commit `0986d5d`).

**La prueba vigila las dos mitades, y la segunda es la que se pierde sola:** el
titular viejo **no se borra, baja a subtítulo**. Esa frase es la única que
enseña la leyenda de colores —*libre* verde, *ocupa* rojo, *a cuánto* amarillo,
*hasta cuándo* naranja— antes de que nadie lea la leyenda. Si al reemplazar el
H1 la frase desapareciera, la página perdería en silencio su explicación de por
qué el plano está pintado así: no se rompe nada, sólo deja de entenderse.
También exige que haya **un solo** `<h1>` —el error clásico al armar ocho
secciones con la misma plantilla—, y compara el subtítulo normalizando las
etiquetas que lo parten palabra por palabra, que es como está escrito.

Hoy `Landing.tsx:380-386` tiene el H1 correcto y el subtítulo con los cuatro
`<span>` de color. **Queda la prueba**: si en un rediseño futuro alguien vuelve
a mover el titular, esto se entera.

---

## E-3 (MENOR — **cerrado durante la ronda**) — un rótulo fuera del copy

`test_l23_los_titulos_y_los_conectores_no_inventan_copy`
(`test_landing_ataques.py:1714`). Rojo al empezar, verde al cerrar.

```
frontend/src/pages/Landing/Landing.tsx:~418: un conector o cejilla dice
'Puesta en marcha'
```

El vestido anterior rotulaba la sección como `03 — Puesta en marcha`. La
sección se llama **«Cómo se usa»** (`copy.md` §5, ancla `#como-se-usa` en
§11.6) y su título es **«Cómo se arranca»**. «Puesta en marcha» no aparecía en
`copy.md` en ninguna forma: era una frase escrita en el `.tsx`.

**Por qué lo cuento aunque sean tres palabras.** La regla de la fase es que el
copy tiene **una sola fuente** —«si un texto no entra, se pide el recorte en
`copy.md`; no se reescribe en el `.tsx`», que el propio encabezado de
`Landing.tsx` se recuerda a sí mismo—. Y el lugar donde esa regla se rompe sola
es justo éste: el rótulo o el conector entre secciones queda mejor con un
gancho, es corto, y nadie lo revisa contra el documento. Es el mismo mecanismo
por el que después aparece, en una página pública que lee un cliente, una
promesa que no pasó por `copy.md` §14 («Lo que NO prometemos»). Y E multiplica
la superficie: **seis conectores nuevos**, uno entre cada par de secciones.

**Cómo funciona la prueba** (para que no moleste sin motivo): compara los
`<h2>`, los `<h3>`, los conectores (`hook` / `gancho` / `conector`) y las
cejillas (`eyebrow`, `sec__num`) contra `copy.md`, normalizando mayúsculas,
espacios finos, entidades, `{" "}` de JSX, la puntuación que queda separada al
sacar las etiquetas, y el número de sección (`01 / …`). Dos licencias
declaradas y ninguna más: el H1 nuevo y el subtítulo que E baja del titular
viejo.

El port lo arregló como corresponde: `03 / CÓMO SE USA`, y los seis conectores
con el título literal de la sección que viene.

---

## Observaciones (no hay test rojo, pero quedan escritas)

**O-1 · `MercaFresco` sigue siendo un nombre con dos dueños.** Lo dije en la
ronda anterior (H-4) y lo sostengo: el mismo nombre identifica a un cliente en
las capturas de la consola del operador (`features/tendencia/outputs/`) y a la
tienda inventada de la landing. `copy.md` §13 lo propone y el dueño de la fase
lo ratificó, así que **no lo pongo en rojo**: `test_l22b` lo excluye
explícitamente de la lista del registro, con el motivo en el docstring. Vale
registrar que **E ya no lo escribe**: el prototipo rotula «Supermercado de
ejemplo» y el nombre no aparece ni una vez en sus 141 KB; en el código
sobrevive sólo en un comentario de `datos.ts`, que no llega al navegador. Si
algún día se elige un nombre que no esté en uso adentro del producto, la
observación se cierra y `MercaFresco` vuelve a la lista de L05.

**O-2 · El oscuro por defecto ignora `prefers-color-scheme`.** E arranca oscura
sin preferencia guardada, a propósito («A y C seguían la preferencia del
sistema, y eso hacía que la mitad de la gente nunca viera la dirección que se
le estaba mostrando»). Es una decisión de dirección de arte legítima, pero hay
gente que pone el sistema en claro **porque en oscuro no puede leer**
(astigmatismo, halación). No es un borde de seguridad y no lo pongo en rojo; sí
pido que el conmutador claro/oscuro esté **a la vista en el primer viewport** y
no escondido en el pie.

**O-3 · El naranja «se libera» en modo claro queda en 2,82:1.** Lo declara el
propio README de E («el punto que un auditor va a marcar primero»). Lo marco:
está por debajo de 3:1. Se sostiene **sólo** porque la regla del producto es
que el estado siempre lleva la palabra escrita al lado del punto de color, y
porque hay tabla equivalente. Si alguna vez se pinta un estado sin su palabra,
esto pasa de observación a defecto.

**O-4 · Colisión de tokens.** También declarada por E: los tokens de la landing
chocan con los `--con-*` de la app. Es deuda conocida y la decisión es del
dueño; si se resuelve «que la app adopte esta paleta», eso toca pantallas con
sesión y sale del alcance de esta fase.

---

## Huecos declarados (la prueba está escrita y corre sola cuando exista)

| # | Qué no se pudo probar | Por qué | Qué lo despierta |
|---|---|---|---|
| **G-1** | Que las nueve escenas **encuadren de verdad** el mueble | Sin navegador no hay `getBoundingClientRect`. Lo que sí se prueba (**L26**) es que la clave del mueble exista, que es la falla **muda**: una clave mal escrita —`GON-04-A` con guion en vez de `·`, `PUN-1` por `PUN-01`, una pieza renombrada en `datos.ts` y el mapa sin tocar— no da error en consola, la cámara se queda donde está y la ficha del contrato queda flotando sobre el piso vacío | Una prueba de navegador (hay una `scripts/probar-landing.mjs` en el árbol que podría ser el lugar) |
| **G-2** | Que con `prefers-reduced-motion` la cámara **cambie de encuadre de golpe** y no se quede pegada en el primero | Es comportamiento en vivo. Se prueba lo que se lee: que nada se esconda (**L20**) y que exista la versión quieta | Igual que G-1 |
| **G-3** | 360–1920 px sin desborde horizontal, claro y oscuro | Requiere renderizar | Igual que G-1 |
| **G-4** | fps reales del vidrio en un Android de gama media | Requiere el dispositivo | — |
| **G-5** | `test_l02` (que lo heredado no arrastre la API) sigue saltando | La landing **no importa ningún** módulo preexistente de `frontend/src`: el grafo está cerrado sobre `pages/Landing/`. No hay rebote que auditar, y es la mejor noticia posible | Se despierta sola el día que la landing importe algo de la app |

---

## Cómo correr esto

```bash
cd backend && python -m pytest tests/test_landing_ataques.py -q
```

39 pruebas, ~12 s, sin red y sin base de datos salvo las cuatro que levantan el
`TestClient` (L08b, L09, L10, L13). Cada mensaje de fallo nombra el archivo, la
línea y el arreglo. `cd frontend && npx tsc --noEmit` queda limpio (esta ronda
no tocó TypeScript).

**Los nueve ataques nuevos**, por si hay que buscarlos:

| Test | Línea | Qué ataca |
|---|---|---|
| `test_l18` | 1326 | El H1 es el slogan y el titular viejo no se pierde |
| `test_l19` | 1379 | La cámara por scroll no traba el scroll ni repinta el árbol |
| `test_l20` | 1431 | Movimiento reducido = cámara quieta, no cámara apagada |
| `test_l21` | 1528 | El vidrio se apaga bajo 720 px (y se pone fondo sólido) |
| `test_l22` | 1624 | Los prototipos entregados son autocontenidos |
| `test_l22b` | 1666 | Los prototipos no nombran a un cliente del registro |
| `test_l23` | 1714 | Títulos y conectores no inventan copy |
| `test_l24` | 1764 | La barra de progreso no le habla al lector de pantalla |
| `test_l25` | 1825 | «Ver en 3D» existe, se llama como el copy y sigue siendo un chunk aparte |
| `test_l26` | 1901 | Las escenas apuntan a muebles que existen |
