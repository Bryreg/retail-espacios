# Fase 10 — El estilo de la landing adentro del sistema

**Decisión del dueño (2026-09-06).** «La landing quedó mejor que el diseño del
sistema. Quiero aplicar el mismo estilo adentro.» Con tres respuestas fijas:

1. **Claro por defecto** adentro; el oscuro queda a un clic (toggle), como en
   la landing pero al revés.
2. **Amarillo solo en el botón principal** de cada pantalla: uno por pantalla.
   Todo lo demás sigue siendo tinta. Los tres estados (libre / se libera /
   tomado) siguen siendo los únicos otros colores con significado.
3. **Arrancar por los tokens** (este PR), después Vender (con la maqueta q1 de
   `docs/maquetas/elegida-vender.html`), después el resto.

Esto **revoca** la regla 4 del rediseño de la pantalla principal en
`docs/ESTADO.md` («nada de ámbar, oro ni ocre, y nada de fondos oscuros»): el
amarillo entra acotado al botón principal, y el oscuro entra como modo
opcional, nunca por defecto. Hay que dejarlo escrito en ESTADO.

## PR 1 — Un solo sistema de tokens

**Qué es.** La app ya es de tokens (`frontend/src/index.css`: `--bg`,
`--surface*`, `--line*`, `--ink-1..4`, `--accent*`, `--libre/--entra/--ocupado`
con `-suave` y `-borde`; y `tailwind.config.js` repite los mismos hex literales
porque `bg-accent/20` necesita un color legible). La landing tiene su propio
sistema de tres capas en `frontend/src/pages/Landing/landing.css` (primitivos
`--n-*`, `--p-*`, `--y-*`, `--st-*`; semánticos claro/oscuro; escala tipográfica
`--t-*`, espacios `--s*`, radios `--r-*`, sombras, `--blur`, duraciones).

**Resultado esperado.** Un archivo compartido `frontend/src/tema.css` con los
primitivos y los semánticos (claro y oscuro) de la landing, expuestos con los
nombres que la app ya usa —para que treinta archivos sigan funcionando— y con
los nombres de la landing. `index.css` consume `tema.css`; `tailwind.config.js`
se actualiza con los hex nuevos (regla del archivo: «si tocás uno, tocá los
dos»); el modo oscuro de Tailwind pasa a `darkMode: ["selector",
'[data-tema="oscuro"]']` (Tailwind 3.4).

**Lo que cambia visualmente en todo el interior, de una:**

- Paleta: papel claro de E (`--p-*`) como fondo, tinta `#0A1014`, líneas finas
  con alfa, tarjetas con el radio y la sombra de E. Los tres estados pasan a
  los hex **validados con dataviz** de E: claro `#00805A · #CE8A0A · #D8342E`,
  oscuro `#00BE86 · #F5A524 · #F4544E`, con sus `-suave` y `-borde` derivados.
  El «resto de la sala» sigue gris.
- Tipografía: la de E. Display de sistema con peso para títulos, texto de
  sistema, **monoespaciada con cifras tabulares para códigos, plata y fechas**.
  Se quitan Chivo y Archivo Narrow y con ellas el `<link>` a Google Fonts de
  `index.html` (cero descargas: también le sirve al LCP de la landing).
  **Riesgo conocido:** Archivo Narrow era condensada a propósito (códigos
  `GON-60·A` en columnas de 56 px, 23 caras sin cortar en el FloorMap). Una
  monoespaciada es más ancha. La regla es: **se ajusta la columna, no la
  tipografía**; el verificador mide recortes y los reporta con archivo:línea.
- Amarillo `--signal` (`--y-500 #FFD028`, texto `--on-signal`) **solo** en el
  botón principal de cada pantalla. El builder entrega la lista: pantalla →
  botón. Candidatos: Login «Entrar» / «Crear cuenta»; Vender el botón que
  guarda el contrato; Montaje «Montado»; Plataforma ninguno si no hay acción
  principal (se documenta). `--accent` sigue siendo tinta para todo lo demás.
- Toggle de tema en la barra del interior (misma pieza que la landing: sol /
  luna), preferencia guardada en `localStorage` con la llave `recabra-tema`;
  por defecto **claro**, sin leer `prefers-color-scheme`. La landing sigue con
  la suya (`recabra-tema-landing`, oscuro por defecto) y **no cambia ni un
  pixel**: se compara con capturas.
- Modo oscuro completo: todo lo que hoy es color literal de Tailwind
  (`bg-white`, `text-slate-*`, `border-slate-*`, `bg-indigo-*`, `text-amber-*`
  — unos 200 usos fuera de la landing) pasa a tokens o a clases que los
  consumen, para que en oscuro nada quede blanco sobre blanco. Los `indigo-*`
  del editor de zonas y del panel de espacios se van (el tailwind.config los
  conserva «hasta que se rehagan esas pantallas»: este PR los rehace en color,
  no en forma).

**Lo que NO cambia en este PR.** Ningún layout, ningún flujo, ningún texto,
ninguna forma de presentar datos: eso es Vender (PR 2) con la maqueta q1. Este
PR es piel. Si un componente pide cambiar de forma para verse bien con la piel
nueva, se anota en `outputs/frontend.md` como pendiente para el PR 2.

## Guardrails

- Cero recursos externos nuevos; la CSP de Fase 3 no se toca. Sacar el
  `<link>` de Google Fonts sí.
- `landing.css` sigue colgando entero de `.lp` (`probar-landing.mjs` lo
  verifica). Si la landing pasa a consumir los primitivos de `tema.css`, es
  porque las capturas antes/después son idénticas.
- Sin librerías nuevas. Sin migraciones (no toca backend).
- Los `probar:*` del frontend (planta, propuesta, nomenclatura, pasillos,
  revision, acomodar, landing) siguen verdes; `tsc` y `build` limpios.
- Contraste: texto normal ≥ 4.5:1 sobre su fondo en claro y en oscuro; los
  estados se miden con `scripts/validate_palette.js` de la skill dataviz
  contra ambas superficies.

## Verificación (en serie, el Verificador)

1. `tsc`, `build`, suite backend una vez.
2. Playwright: cada pantalla del interior —Login, Vender (`/`), Montaje,
   Plataforma, reporte, detalle de cliente— en claro y en oscuro, a 1440 y
   390 px, con datos sembrados (patrón `seed_tendencia.py` del scratchpad para
   plataforma; worker de `galerias` para Vender). Capturas ANTES (main) y
   DESPUÉS en `outputs/capturas/`.
3. Medir recortes de códigos en el FloorMap y en columnas angostas (rects, no
   scrollWidth). Contraste de los pares texto/fondo principales.
4. Landing: capturas antes/después a 360 y 1440, claro y oscuro, idénticas.
5. Grep final: `fonts.googleapis` no aparece en `frontend/`; colores literales
   de Tailwind fuera de `Landing/` reportados con conteo.

## Entregables

- `outputs/tema.md`: la tabla de mapeo token viejo → token nuevo, con los hex,
  y la lista pantalla → botón principal amarillo.
- `outputs/frontend.md`: qué se tocó, qué quedó pendiente para el PR 2.
- `outputs/auditor.md` y los tests que agregue.
- `outputs/verificacion.md` + capturas.
- `docs/ESTADO.md`: sección «Fase 10 — el estilo de la landing adentro», la
  revocación explícita de la regla 4, y el gotcha de la condensada vs la mono.
