import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#050816",
        panel: "#0b1020",
        panel2: "#10172a",
        line: "#1d4ed8",
        brand: "#3b82f6",
        cyanx: "#06b6d4"
      },
      boxShadow: {
        glow: "0 0 45px rgba(59,130,246,.20)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
export default config;
