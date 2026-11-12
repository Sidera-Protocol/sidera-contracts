import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sidera brand — deep space + starlight
        space: {
          950: "#05060f",
          900: "#0a0d1f",
          800: "#121735",
        },
        star: {
          400: "#8b9cff",
          500: "#5f6fff",
          600: "#4a56e8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
