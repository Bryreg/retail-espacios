/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      colors: {
        // Backgrounds
        bg:        "#F8FAFC",
        surface:   "#FFFFFF",
        "surface-2": "#F1F5F9",
        "surface-3": "#E8EEF5",

        // Borders
        line:        "#E2E8F0",
        "line-soft": "#EFF3F7",
        "line-strong": "#CBD5E1",

        // Text
        "ink-1": "#020617",
        "ink-2": "#334155",
        "ink-3": "#475569",
        "ink-4": "#94A3B8",

        // Acento — azul de oficina. Sólo para lo que se puede tocar.
        accent: {
          DEFAULT: "#0369A1",
          50:      "#EFF7FC",
          100:     "#D7EBF6",
          200:     "#A6D2E9",
          600:     "#02598A",
          700:     "#024A73",
          ink:     "#FFFFFF",
        },

        // Accent overrides (exposed as utility classes)
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

        // Semantic
        success: {
          DEFAULT: "#15803D",
          50:      "#EAF5EE",
          100:     "#C4E2CF",
        },
        warning: {
          DEFAULT: "#B45309",
          50:      "#FCF2E5",
          100:     "#F2DBB6",
        },
        danger: {
          DEFAULT: "#DC2626",
          50:      "#FDEDED",
          100:     "#F8CCCC",
        },
        "muted-status": "#94A3B8",

        // Dark drawer / dark surfaces
        dark: {
          bg:        "#0F172A",
          surface:   "#1E293B",
          "surface-2": "#273548",
          line:      "#334155",
          "line-2":  "#475569",
          "ink-1":   "#F1F5F9",
          "ink-2":   "#CBD5E1",
          "ink-3":   "#94A3B8",
        },
      },

      // ── Border radius ───────────────────────────────────────────────────────
      borderRadius: {
        xs:  "4px",
        sm:  "6px",
        md:  "8px",
        lg:  "10px",
        xl:  "14px",
        "2xl": "18px",
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
