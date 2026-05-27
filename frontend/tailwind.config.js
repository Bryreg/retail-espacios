/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },

      // ── Colors ──────────────────────────────────────────────────────────────
      colors: {
        // Backgrounds
        bg:        "#F8F6F1",
        surface:   "#FFFFFF",
        "surface-2": "#FBF9F4",
        "surface-3": "#EFEAE0",

        // Borders
        line:        "#E5DFD1",
        "line-soft": "#EEE8DA",
        "line-strong": "#D9D1BE",

        // Text
        "ink-1": "#1A1814",
        "ink-2": "#4A463C",
        "ink-3": "#807A6B",
        "ink-4": "#B5AE9C",

        // Accent — violet (default)
        accent: {
          DEFAULT: "#7C3AED",
          50:      "#F5F0FF",
          100:     "#EAE0FE",
          200:     "#D5C2FE",
          600:     "#6D28D9",
          700:     "#5B21B6",
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
          50:      "#EAF6EE",
          100:     "#D1E9D9",
        },
        warning: {
          DEFAULT: "#B45309",
          50:      "#FDF6E3",
          100:     "#FBE9B7",
        },
        danger: {
          DEFAULT: "#B91C1C",
          50:      "#FCEEEE",
          100:     "#F8D5D5",
        },
        "muted-status": "#94917F",

        // Dark drawer / dark surfaces
        dark: {
          bg:        "#14130F",
          surface:   "#1C1B16",
          "surface-2": "#25241E",
          line:      "#2F2D26",
          "line-2":  "#3F3D35",
          "ink-1":   "#F2EFE8",
          "ink-2":   "#BBB6A6",
          "ink-3":   "#807B6B",
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

      // ── Box shadows (warm — rgba(31,27,18,...)) ──────────────────────────────
      boxShadow: {
        xs:  "0 1px 0 rgba(31,27,18,0.04)",
        sm:  "0 1px 2px rgba(31,27,18,0.05), 0 1px 1px rgba(31,27,18,0.03)",
        md:  "0 2px 6px rgba(31,27,18,0.05), 0 1px 2px rgba(31,27,18,0.04)",
        lg:  "0 12px 28px rgba(31,27,18,0.10), 0 4px 10px rgba(31,27,18,0.05)",
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
