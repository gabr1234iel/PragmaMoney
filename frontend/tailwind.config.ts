import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "lobster-primary": "#FF7338",
        "lobster-secondary": "#ED7A7A",
        "lobster-accent": "#FF5714",
        "lobster-bg": "#FFF4ED",
        "lobster-surface": "#FFE5D4",
        "lobster-text": "#7F2011",
        "lobster-dark": "#1a1a2e",
        "lobster-border": "#FFD4B8",
        "lobster-hover": "#FF6020",
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        body: ["Lora", "serif"],
      },
      backgroundImage: {
        "gradient-lobster": "linear-gradient(135deg, #FF7338 0%, #ED7A7A 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
