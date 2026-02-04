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
        "lobster-primary": "#C4846C",
        "lobster-secondary": "#D4A090",
        "lobster-accent": "#B06E55",
        "lobster-bg": "#FAF5F2",
        "lobster-surface": "#F0E6E0",
        "lobster-text": "#5C3D2E",
        "lobster-dark": "#2D2A32",
        "lobster-border": "#E6D5CC",
        "lobster-hover": "#A8604A",
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        body: ["Lora", "serif"],
      },
      backgroundImage: {
        "gradient-lobster": "linear-gradient(135deg, #C4846C 0%, #D4A090 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
