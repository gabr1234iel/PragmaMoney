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
        "pragma-primary": "#FF4D4D", // Main Red
        "pragma-accent": "#FF5F57",  // Accent Red
        "pragma-dark": "#0A0F1A",    // Base Background
        "pragma-surface": "#141B2D", // Card Surface
        "pragma-text": "#FFFFFF",    // Main Text
        "pragma-muted": "#8A93A6",   // Muted Text
        "pragma-border": "#2D3748",  // Border

        // Legacy support mapping (gradual migration)
        "lobster-primary": "#FF4D4D",
        "lobster-secondary": "#FF5F57",
        "lobster-accent": "#FF4D4D",
        "lobster-bg": "#0A0F1A",
        "lobster-surface": "#141B2D",
        "lobster-text": "#FFFFFF",
        "lobster-dark": "#FFFFFF",
        "lobster-border": "#2D3748",
        "lobster-hover": "#FF3333",
        "lobster-soft": "#F7F1F3",
        "lobster-soft-hover": "#FF8080",
      },
      fontFamily: {
        display: ["Courier Prime", "monospace"],
        body: ["Courier Prime", "monospace"],
        mono: ["Courier Prime", "monospace"],
        sans: ["Courier Prime", "monospace"], // Override default sans for this specific aesthetic
      },
      backgroundImage: {
        "gradient-pragma": "linear-gradient(135deg, #FF4D4D 0%, #FF5F57 100%)",
        "gradient-lobster": "linear-gradient(135deg, #FF4D4D 0%, #FF5F57 100%)", // Legacy alias
      },
    },
  },
  plugins: [],
};

export default config;
