# Gotchas de las sesiones de diseño

> Engram (pendiente de cargar) · `tooling/gotchas-diseno` · sesiones del
> 2026-08-31 al 2026-09-01 · complementa
> [context/08-gotchas-pendientes.md](../context/08-gotchas-pendientes.md)

## Agentes

- **Un agente borró el trabajo de otros diez.** En una ronda, un agente
  «ordenó» el directorio de maquetas y se llevó por delante once maquetas, el
  brief y las tipografías. Desde entonces todo prompt de diseño lleva:
  *«no borres, no muevas, no limpies, no reorganices ningún archivo ni carpeta»*,
  y el trabajo se respalda fuera del directorio de trabajo antes de lanzar la
  ronda. **Lo definitivo se commitea el mismo día**, que es la única copia que
  sobrevive a un contenedor que se reinicia.
- **La concurrencia de los workflows es `min(16, CPUs − 2)`.** En una caja de 4
  CPUs eso da **2 agentes en paralelo**: una ronda de 17 agentes tarda ~35
  minutos de reloj. Dimensionar las rondas a 4–6 agentes.
- **El contenedor se reinicia y mata las tareas de fondo.** Antes de relanzar,
  revisar qué sobrevivió en disco y recortar el script a los agentes que faltan.
  También conviene verificar el checkout contra `git ls-remote`: dos veces el
  contenedor volvió a un commit viejo.

## Color

- **La paleta se valida, no se elige a ojo.** El validador
  (`dataviz/scripts/validate_palette.js`) rechazó verde + naranja:
  `#C8501E ↔ #17734D` da ΔE 5.3 en protanopía. Verde contra rojo no tiene arreglo
  para protanopía; mover «vigente» a un teal `#0086A0` subió a **ΔE 16.9, todo
  en verde**. Umbral: ΔE ≥ 8, o entre 6 y 8 **con** una segunda codificación.

## Gráficos

- **Reglas y caídas sólidas, nunca punteadas.** El punteado se lee como
  proyección o umbral cuando es sólo una guía.
- **Ni un número sobre cada punto.** Rotular selectivamente: el extremo, el
  quiebre, la serie que importa.
- **Si el contenedor tiene alto fijo, el alto tiene que incluir la banda del eje**
  o la tarjeta termina con un scroll interno diminuto.

## Verificación

Las maquetas se verifican **por código, no a ojo**. Tres scripts de Playwright,
que conviene reconstruir si se pierden:

| Script | Qué mide |
|---|---|
| `ver.mjs` | Captura la pantalla, mide alto y desborde horizontal, junta errores de página y recursos que no cargaron |
| `recorte.mjs` | Recorre cada panel y marca los elementos que se salen de su caja (con `:not(svg *)`, para no entrar al SVG) |
| `solape.mjs` | Cruza todos los `<text>` del SVG entre sí y contra el viewBox: choques y desbordes |

Lanzar Chromium con
`executablePath: "/opt/pw-browsers/chromium"` y
`--use-gl=swiftshader --enable-unsafe-swiftshader --no-sandbox`.

## Tipografías

**El navegador del contenedor no llega a Google Fonts.** Las 22 familias están
descargadas como `woff2` (latin + latin-ext) en `docs/maquetas/fuentes/` y las
maquetas las cargan de ahí. Si una maqueta se ve con la tipografía del sistema,
es esto.

## Redacción en español

`frontend/src/utils/redaccion.ts` resuelve la concordancia (`contar`,
`concuerda`, `pesos`, `enDias`, `frase`). Dos trampas que ya mordieron:

- **El verbo concuerda con el sujeto, no con la cifra.** «entran $3.800.000»:
  los pesos son plurales siempre, aunque el monto sea uno solo.
- **El formato corto de `es-CO` mete «de»**: `31 de ago`. Para «31 ago» hay que
  usar un arreglo de meses a mano.
- **Viudas y huérfanas**: dos oraciones en un mismo `<p>` dejaban un «4» colgando
  al final de la línea. Una oración por párrafo.
