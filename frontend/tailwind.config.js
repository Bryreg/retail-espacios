/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────────────────────
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      colors: {
        // Backgrounds
        bg:        "#F2F4F7",
        surface:   "#FFFFFF",
        "surface-2": "#F8FAFC",
        "surface-3": "#EEF1F5",

        // Borders
        line:        "#E1E6EC",
        "line-soft": "#EDF0F4",
        "line-strong": "#CFD6DF",

        // Text
        "ink-1": "#0B1220",
        "ink-2": "#3F4A5A",
        "ink-3": "#6B7688",
        "ink-4": "#A3ACBB",

        // Acento — navy del tema «Morgen Capital» (21st.dev)
        accent: {
          DEFAULT: "#00004D",
          50:      "#EFEFF7",
          100:     "#DCDCEF",
          200:     "#B4B4DF",
          600:     "#00003B",
          700:     "#00002B",
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
          DEFAULT: "#0F7B4F",
          50:      "#E7F4ED",
          100:     "#BEE0CE",
        },
        warning: {
          DEFAULT: "#9A6B0E",
          50:      "#FBF3E2",
          100:     "#EEDCAE",
        },
        danger: {
          DEFAULT: "#C0392E",
          50:      "#FBECEA",
          100:     "#F0CCC7",
        },
        "muted-status": "#8A93A1",

        // Dark drawer / dark surfaces
        dark: {
          bg:        "#0C1017",
          surface:   "#141A23",
          "surface-2": "#1B222D",
          line:      "#262F3B",
          "line-2":  "#35404F",
          "ink-1":   "#EDF1F6",
          "ink-2":   "#AEB8C6",
          "ink-3":   "#77828F",
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

      // ── Box shadows (warm — rgba(11,18,32,...)) ──────────────────────────────
      boxShadow: {
        xs:  "0 1px 0 rgba(11,18,32,0.04)",
        sm:  "0 1px 2px rgba(11,18,32,0.05), 0 1px 1px rgba(11,18,32,0.03)",
        md:  "0 2px 6px rgba(11,18,32,0.05), 0 1px 2px rgba(11,18,32,0.04)",
        lg:  "0 12px 28px rgba(11,18,32,0.10), 0 4px 10px rgba(11,18,32,0.05)",
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
