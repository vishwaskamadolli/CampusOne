import type { Config } from "tailwindcss";

const themed = (name: string) => `rgb(var(--theme-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        white: themed("white"),
        black: themed("black"),
        ink: themed("ink"),
        canvas: themed("canvas"),
        brand: { 50: themed("brand-50"), 100: themed("brand-100"), 200: themed("brand-200"), 500: themed("brand-500"), 600: themed("brand-600"), 700: themed("brand-700") },
        slate: { 50: themed("slate-50"), 100: themed("slate-100"), 200: themed("slate-200"), 300: themed("slate-300"), 400: themed("slate-400"), 500: themed("slate-500"), 600: themed("slate-600"), 900: themed("slate-900"), 950: themed("slate-950") },
        emerald: { 50: themed("emerald-50"), 200: themed("emerald-200"), 300: themed("emerald-300"), 600: themed("emerald-600"), 700: themed("emerald-700"), 800: themed("emerald-800") },
        rose: { 50: themed("rose-50"), 100: themed("rose-100"), 500: themed("rose-500"), 600: themed("rose-600"), 700: themed("rose-700") },
        amber: { 100: themed("amber-100"), 700: themed("amber-700") },
        blue: { 50: themed("blue-50"), 100: themed("blue-100"), 700: themed("blue-700") },
        violet: { 50: themed("violet-50"), 100: themed("violet-100"), 700: themed("violet-700") },
      },
      boxShadow: { soft: "0 12px 40px rgb(var(--color-shadow) / 0.07)" },
    },
  },
  plugins: [],
} satisfies Config;
