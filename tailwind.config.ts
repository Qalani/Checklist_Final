import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zen: {
          50: "rgb(var(--color-zen-50) / <alpha-value>)",
          100: "rgb(var(--color-zen-100) / <alpha-value>)",
          200: "rgb(var(--color-zen-200) / <alpha-value>)",
          300: "rgb(var(--color-zen-300) / <alpha-value>)",
          400: "rgb(var(--color-zen-400) / <alpha-value>)",
          500: "rgb(var(--color-zen-500) / <alpha-value>)",
          600: "rgb(var(--color-zen-600) / <alpha-value>)",
          700: "rgb(var(--color-zen-700) / <alpha-value>)",
          800: "rgb(var(--color-zen-800) / <alpha-value>)",
          900: "rgb(var(--color-zen-900) / <alpha-value>)",
        },
        sage: {
          50: "rgb(var(--color-sage-50) / <alpha-value>)",
          100: "rgb(var(--color-sage-100) / <alpha-value>)",
          200: "rgb(var(--color-sage-200) / <alpha-value>)",
          300: "rgb(var(--color-sage-300) / <alpha-value>)",
          400: "rgb(var(--color-sage-400) / <alpha-value>)",
          500: "rgb(var(--color-sage-500) / <alpha-value>)",
          600: "rgb(var(--color-sage-600) / <alpha-value>)",
          700: "rgb(var(--color-sage-700) / <alpha-value>)",
          800: "rgb(var(--color-sage-800) / <alpha-value>)",
          900: "rgb(var(--color-sage-900) / <alpha-value>)",
        },
        warm: {
          50: "rgb(var(--color-warm-50) / <alpha-value>)",
          100: "rgb(var(--color-warm-100) / <alpha-value>)",
          200: "rgb(var(--color-warm-200) / <alpha-value>)",
          300: "rgb(var(--color-warm-300) / <alpha-value>)",
          400: "rgb(var(--color-warm-400) / <alpha-value>)",
          500: "rgb(var(--color-warm-500) / <alpha-value>)",
          600: "rgb(var(--color-warm-600) / <alpha-value>)",
          700: "rgb(var(--color-warm-700) / <alpha-value>)",
          800: "rgb(var(--color-warm-800) / <alpha-value>)",
          900: "rgb(var(--color-warm-900) / <alpha-value>)",
        },
        surface: "rgb(var(--color-surface) / <alpha-value>)",
      },
      boxShadow: {
        'neo': '8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff',
        'neo-inset': 'inset 2px 2px 5px #d1d9e6, inset -2px -2px 5px #ffffff',
        'soft': '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'medium': '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
        'lift': '0 8px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
