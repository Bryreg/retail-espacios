/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────────────────────
      // El mismo par que `index.css`: Chivo para leer, Archivo Narrow para
      // códigos y versalitas. `mono` no es monoespaciada — lo que hacía falta
      // de un mono era que las cifras alinearan, y eso lo da `tabular-nums`.
      fontFamily: {
        sans: ["Chivo", "system-ui", "ui-sans-serif", "sans-serif"],
        mono: ["Archivo Narrow", "Chivo", "system-ui", "sans-serif"],
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      // Estos valores son los MISMOS que las variables de `index.css`, escritos
      // literales y no como `var(--x)` a propósito: media docena de clases usan
      // el modificador de opacidad (`bg-accent/20`), y Tailwind sólo sabe
      // separarle el alfa a un color que puede leer. Si tocás uno, tocá los dos.
      colors: {
        // Fondos — papel frío
        bg:        "#EFF1F1",
        surface:   "#FFFFFF",
        "surface-2": "#F2F5F5",
        "surface-3": "#E8ECED",

        // Líneas
        line:        "#DEE2E3",
        "line-soft": "#F1F4F4",
        "line-strong": "#C7CED0",

        // Tinta
        "ink-1": "#14181C",
        "ink-2": "#4A5459",
        "ink-3": "#6B7479",
        "ink-4": "#8E979B",

        // Acento — la tinta. El color queda para el estado.
        accent: {
          DEFAULT: "#14181C",
          50:      "#F2F5F5",
          100:     "#E8ECED",
          200:     "#C7CED0",
          600:     "#14181C",
          700:     "#14181C",
          ink:     "#FFFFFF",
        },

        // Los tres acentos viejos. Ya no los usa ninguna pantalla rediseñada,
        // pero el editor de zonas y el panel de espacios siguen escritos con
        // clases `indigo-*`, y sacarlos de acá les cambiaría el tono sin que
        // nadie lo haya pedido. Se van cuando se rehagan esas pantallas.
        indigo: {
          accent:  "#4F46E5",
          50:      "#EEF1FF",
          100:     "#DEE3FF",
          200:     "#C0CAFF",
          600:     "#4338CA",
          700:     "#3730A3",
        },
        teal: {
          accent:  "#0D7E76",
          50:      "#E6F4F2",
          100:     "#C5E5E0",
          200:     "#94CFC7",
          600:     "#096B64",
          700:     "#075852",
        },
        coral: {
          accent:  "#DC5F3E",
          50:      "#FCEFE9",
          100:     "#F8DACC",
          200:     "#F0B59A",
          600:     "#C24E2F",
          700:     "#9F3F26",
        },

        // Los tres estados. Verde se puede, naranja a medias, rojo no.
        libre:   { DEFAULT: "#00786A", 50: "#D8F0EA", 100: "#A8DCD0" },
        entra:   { DEFAULT: "#F08519", txt: "#B35F0A", 50: "#FCEEDD", 100: "#F2C79A" },
        ocupado: { DEFAULT: "#8E1226", 50: "#F7E4E7", 100: "#E0B4BD" },
        resto:   "#D3D9DB",

        // Los nombres semánticos apuntan a los mismos tres: acá no quieren
        // decir «bien / cuidado / error», quieren decir libre, se libera,
        // tomado.
        success: { DEFAULT: "#00786A", 50: "#D8F0EA", 100: "#A8DCD0" },
        warning: { DEFAULT: "#B35F0A", 50: "#FCEEDD", 100: "#F2C79A" },
        danger:  { DEFAULT: "#8E1226", 50: "#F7E4E7", 100: "#E0B4BD" },
        "muted-status": "#8E979B",

        // Cajón oscuro — mismo papel, del otro lado.
        dark: {
          bg:        "#14181C",
          surface:   "#1E2429",
          "surface-2": "#2A3238",
          line:      "#39434A",
          "line-2":  "#4F5A62",
          "ink-1":   "#EFF1F1",
          "ink-2":   "#C2CACD",
          "ink-3":   "#8E979B",
        },
      },

      // ── Border radius ───────────────────────────────────────────────────────
      // Dos peldaños: 2px para lo que se toca, 3px para el panel.
      borderRadius: {
        xs:  "2px",
        sm:  "2px",
        md:  "2px",
        lg:  "2px",
        xl:  "3px",
        "2xl": "3px",
      },

      // ── Box shadows — sombra de la tinta, no gris neutro ─────────────────────
      boxShadow: {
        xs:  "0 1px 0 rgba(2,6,23,0.04)",
        sm:  "0 1px 2px rgba(2,6,23,0.05), 0 1px 1px rgba(2,6,23,0.03)",
        md:  "0 2px 6px rgba(2,6,23,0.05), 0 1px 2px rgba(2,6,23,0.04)",
        lg:  "0 12px 28px rgba(2,6,23,0.10), 0 4px 10px rgba(2,6,23,0.05)",
      },

      // ── Spacing (design-system multiples — 4px base) ────────────────────────
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
