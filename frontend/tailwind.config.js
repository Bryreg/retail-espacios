/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],

  // ── Modo oscuro ───────────────────────────────────────────────────────────
  // El interior enciende el oscuro con `data-tema="oscuro"` en el `<html>`
  // (`src/tema.tsx`), nunca con `prefers-color-scheme`: claro por defecto es
  // decisión del dueño, y un modo que se enciende solo con la preferencia del
  // sistema no es un modo opcional. La estrategia `selector` de Tailwind 3.4
  // deja que `dark:` cuelgue de ese atributo para lo que necesite una excepción
  // puntual; el grueso del tema NO pasa por `dark:`, pasa por los tokens (ver
  // abajo), que es lo que hace que no haya que duplicar cada clase.
  darkMode: ["selector", '[data-tema="oscuro"]'],

  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────────────────────
      // Las mismas tres pilas de sistema que `src/tema.css`. Se fueron Chivo y
      // Archivo Narrow, y con ellas el `<link>` a Google Fonts de `index.html`.
      // `mono` ahora SÍ es monoespaciada: lo que hacía falta de un mono era que
      // las cifras alinearan (`tabular-nums`, puesto en el body) y además que
      // los códigos tuvieran retícula real, que es lo que permite medir las
      // columnas en `ch` en vez de en px.
      fontFamily: {
        display: ["Helvetica Neue", "Segoe UI Variable Display", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Noto Sans", "Arial", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Noto Sans", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Cascadia Mono", "JetBrains Mono", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      // ESTE BLOQUE YA NO REPITE HEX. Antes decía: «los mismos valores que
      // `index.css`, escritos literales y no como `var(--x)` a propósito,
      // porque media docena de clases usa el modificador de opacidad
      // (`bg-accent/20`) y Tailwind sólo sabe separarle el alfa a un color que
      // puede leer. Si tocás uno, tocá los dos.»
      //
      // La RAZÓN sigue siendo correcta y se respeta entera; lo que se cae es la
      // consecuencia («tocá los dos»), y se cae porque el interior ahora tiene
      // modo oscuro: un hex congelado acá es un color que no se entera del
      // tema, y `bg-accent` quedaría casi negro sobre una sala casi negra.
      //
      // La forma de tener las dos cosas es la que Tailwind 3 documenta para
      // esto: el token se publica en CANALES (`--accent-rgb: 10 16 20`, en
      // `src/tema.css`) y acá se escribe `rgb(var(--accent-rgb) /
      // <alpha-value>)`. `bg-accent/20` sigue funcionando exactamente igual,
      // ahora contra el tema que esté puesto, y el color vive en UN solo lugar.
      // El hex de cada uno está al lado del canal, en `tema.css`.
      //
      // Los `dark-*` son la excepción y siguen siendo hex literales: son el
      // «cajón oscuro» —el visor de archivos, el encabezado del editor 3D— que
      // se pinta oscuro SIEMPRE, con tema claro o con tema oscuro. Un token que
      // cambiara con el tema los rompería.
      colors: {
        // Fondos — papel frío en claro, sala a media luz en oscuro
        bg:          "rgb(var(--bg-rgb) / <alpha-value>)",
        surface:     "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2-rgb) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3-rgb) / <alpha-value>)",

        // Líneas
        line:          "rgb(var(--line-rgb) / <alpha-value>)",
        "line-soft":   "rgb(var(--line-soft-rgb) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong-rgb) / <alpha-value>)",

        // Tinta. `ink-4` no es color de texto: placeholder, «sin dato»,
        // deshabilitado.
        "ink-1": "rgb(var(--ink-1-rgb) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2-rgb) / <alpha-value>)",
        "ink-3": "rgb(var(--ink-3-rgb) / <alpha-value>)",
        "ink-4": "rgb(var(--ink-4-rgb) / <alpha-value>)",

        // Acento — la tinta. El color queda para el estado, y el amarillo
        // queda para UN botón por pantalla (`.btn-principal`, en `index.css`).
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          50:      "rgb(var(--accent-50-rgb) / <alpha-value>)",
          100:     "rgb(var(--accent-100-rgb) / <alpha-value>)",
          200:     "rgb(var(--accent-200-rgb) / <alpha-value>)",
          600:     "rgb(var(--accent-rgb) / <alpha-value>)",
          700:     "rgb(var(--accent-rgb) / <alpha-value>)",
          ink:     "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        },

        // La señal. NO es de uso libre: la pinta la clase `.btn-principal` y
        // nada más. Está acá para que exista `ring-signal` en un foco y para
        // que `text-signal-ink` pueda escribir una cifra de plata.
        signal: {
          DEFAULT: "rgb(var(--signal-rgb) / <alpha-value>)",
          ink:     "rgb(var(--signal-ink-rgb) / <alpha-value>)",
          on:      "rgb(var(--on-signal-rgb) / <alpha-value>)",
        },

        // Los tres estados. Verde se puede, ámbar a medias, rojo no.
        // El relleno (`DEFAULT`) pinta caras, puntos, barras y chips; para
        // ESCRIBIR se usa `txt`, porque en claro los rellenos no llegan a
        // 4,5:1 sobre el papel (y el ámbar ni se acerca: 2,54:1).
        libre:   {
          DEFAULT: "rgb(var(--libre-rgb) / <alpha-value>)",
          txt:     "rgb(var(--libre-txt-rgb) / <alpha-value>)",
          50:      "rgb(var(--libre-suave-rgb) / <alpha-value>)",
          100:     "rgb(var(--libre-borde-rgb) / <alpha-value>)",
        },
        entra:   {
          DEFAULT: "rgb(var(--entra-rgb) / <alpha-value>)",
          txt:     "rgb(var(--entra-txt-rgb) / <alpha-value>)",
          50:      "rgb(var(--entra-suave-rgb) / <alpha-value>)",
          100:     "rgb(var(--entra-borde-rgb) / <alpha-value>)",
        },
        ocupado: {
          DEFAULT: "rgb(var(--ocupado-rgb) / <alpha-value>)",
          txt:     "rgb(var(--ocupado-txt-rgb) / <alpha-value>)",
          50:      "rgb(var(--ocupado-suave-rgb) / <alpha-value>)",
          100:     "rgb(var(--ocupado-borde-rgb) / <alpha-value>)",
        },
        resto: {
          DEFAULT: "rgb(var(--resto-rgb) / <alpha-value>)",
          50:      "rgb(var(--resto-suave-rgb) / <alpha-value>)",
          100:     "rgb(var(--resto-borde-rgb) / <alpha-value>)",
        },

        // Los nombres semánticos apuntan a las variantes de TEXTO de los mismos
        // tres: acá no quieren decir «bien / cuidado / error», quieren decir
        // libre, se libera, tomado.
        success: {
          DEFAULT: "rgb(var(--success-rgb) / <alpha-value>)",
          50:      "rgb(var(--success-50-rgb) / <alpha-value>)",
          100:     "rgb(var(--success-100-rgb) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning-rgb) / <alpha-value>)",
          50:      "rgb(var(--warning-50-rgb) / <alpha-value>)",
          100:     "rgb(var(--warning-100-rgb) / <alpha-value>)",
        },
        danger:  {
          DEFAULT: "rgb(var(--danger-rgb) / <alpha-value>)",
          50:      "rgb(var(--danger-50-rgb) / <alpha-value>)",
          100:     "rgb(var(--danger-100-rgb) / <alpha-value>)",
        },
        "muted-status": "rgb(var(--muted-status-rgb) / <alpha-value>)",

        // Cajón oscuro — el chrome que es oscuro SIEMPRE, en los dos temas.
        // Hex literales a propósito (ver arriba). Los valores son los de la
        // escala de neutros nueva, para que el negro sea el mismo negro que el
        // del modo oscuro y no un negro parecido.
        dark: {
          bg:          "#04070A",
          surface:     "#0B1116",
          "surface-2": "#16212A",
          line:        "#1F2C36",
          "line-2":    "#2C3B47",
          "ink-1":     "#EDF3F2",
          "ink-2":     "#9DAEB6",
          "ink-3":     "#6C7E88",
        },

        // Se fueron `indigo-*`, `teal-*` y `coral-*`. La razón escrita que los
        // conservaba era «se van cuando se rehagan esas pantallas»: este PR
        // rehace el editor de zonas y el panel de espacios EN COLOR —el azul
        // pasa a `--accent` (tinta) y las selecciones a `--signal-ink`—, que es
        // exactamente lo que esos tokens pintaban. La FORMA de esas pantallas
        // sigue pendiente para el PR 2: quien esperaba el rediseño completo, no
        // es este PR.
      },

      // ── Border radius ───────────────────────────────────────────────────────
      // La escala de la landing, capada en 16px. El escalón de arriba (24px)
      // está calculado para una página con 96px de aire entre bloques; acá los
      // paneles están a 10px y una esquina de 24px se come el renglón del
      // encabezado. `md` (10px) tiene ~80 usos y venía de 2px: es el cambio
      // visual más extendido del PR.
      borderRadius: {
        xs:    "4px",
        sm:    "6px",
        md:    "10px",
        lg:    "16px",
        xl:    "16px",
        "2xl": "16px",
        pill:  "999px",
      },

      // ── Box shadows ─────────────────────────────────────────────────────────
      // La línea de 1px sigue siendo el separador de todo lo APOYADO; la sombra
      // queda para lo que FLOTA, y ahora hay dos alturas de flote en vez de una
      // porque el interior tiene desplegables que se confundían con la tabla de
      // atrás. Los valores salen de `--sh-1/2/3`, que cambian con el tema — por
      // eso se leen del token y no se repiten acá.
      boxShadow: {
        xs:  "none",
        sm:  "var(--sh-1)",
        md:  "var(--sh-2)",
        lg:  "var(--sh-3)",
      },

      // ── Spacing (design-system multiples — 4px base) ────────────────────────
      // OJO, desfase real y consciente con `--s5`/`--s6` de `tema.css`
      // (24px/32px): acá `5` es 20px y `6` es 24px. NO se toca en este PR —
      // mover `p-6` de 24 a 32px es forma, no piel. Anotado para el PR 2.
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        // keep Tailwind defaults beyond 6 intact (no override needed)
      },

      // ── Animation ───────────────────────────────────────────────────────────
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "calc(200px + 100%) 0" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        shimmer:      "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
