/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        // Uses your Hex codes mapped to CSS vars
        primary: {
          DEFAULT: "var(--color-primary)",       // #1156B0
          light: "var(--color-primary-light)",   // #93BFEF
          lighter: "var(--color-primary-lighter)", // #E9F5FF
          gray: "var(--color-primary-gray)", //#E2E2E2
        },
        neutral: {
          DEFAULT: "var(--color-text-main)",     // #1F1F1F (Text, lines, dark)
          bg: "var(--color-bg)",                 // #FFFFFF
        },
        semantic: {
          success: "var(--color-success)",       // #4caf50
          error: "var(--color-error)",           // #ef5350
          warning: "var(--color-warning)",       // #ff9800
          info: "var(--color-info)",             // #03a9f4
        },
      },
      fontFamily: {
        // Inter for English, Noto Kufi for Arabic
        sans: ["var(--font-primary)", "sans-serif"], 
      },
      borderRadius: {
        // "Slightly rounded" (6px is the midpoint of 4-8px)
        base: "var(--radius-base)", 
      },
      boxShadow: {
        // Overriding defaults to ensure "Flat UI" availability
        flat: "none", 
      }
    },
  },
  plugins: [],
};