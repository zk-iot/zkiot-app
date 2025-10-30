// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#3B82F6", // tailwind blue-500
          blueLight: "#60A5FA", // blue-400
          white: "#FFFFFF",
          black: "#000000",
          gray: "#0B0F19" // 深い黒に近いグレー
        }
      },
      boxShadow: {
        glow: "0 0 25px rgba(59,130,246,0.25)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: []
} satisfies Config;
