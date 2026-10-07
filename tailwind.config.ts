import type { Config } from "tailwindcss";

const config: Config = {
  // These names are design-system classes (src/presentation/samesay/samesay.css); keep Tailwind from emitting its own rules for them.
  blocklist: ["block", "grid", "table", "sticky"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/presentation/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/presentation/hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "hsl(260, 100%, 97%)",
          100: "hsl(260, 90%, 93%)",
          200: "hsl(260, 85%, 85%)",
          300: "hsl(260, 80%, 75%)",
          400: "hsl(260, 75%, 65%)",
          500: "hsl(260, 70%, 55%)",
          600: "hsl(260, 65%, 45%)",
          700: "hsl(260, 60%, 38%)",
          800: "hsl(260, 55%, 28%)",
          900: "hsl(260, 50%, 18%)",
        },
        accent: {
          400: "hsl(320, 80%, 65%)",
          500: "hsl(320, 75%, 55%)",
        },
        surface: {
          DEFAULT: "hsl(230, 20%, 9%)",
          50: "hsl(230, 20%, 12%)",
          100: "hsl(230, 18%, 15%)",
          200: "hsl(230, 16%, 20%)",
          300: "hsl(230, 14%, 28%)",
        },
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(ellipse at top, hsl(260,60%,20%) 0%, hsl(230,20%,9%) 60%)",
        "card-gradient":
          "linear-gradient(135deg, hsla(260,60%,30%,0.15) 0%, hsla(320,60%,30%,0.08) 100%)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "spin-slow": "spin 8s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        glow: "0 0 40px -10px hsl(260, 70%, 55%)",
        "glow-sm": "0 0 20px -5px hsl(260, 70%, 55%)",
        "glow-accent": "0 0 40px -10px hsl(320, 75%, 55%)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
