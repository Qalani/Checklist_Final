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
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#868e96',
          700: '#495057',
          800: '#343a40',
          900: '#212529',
        },
        sage: {
          50: '#f6f8f6',
          100: '#e8ede8',
          200: '#d1dbd1',
          300: '#a8bba8',
          400: '#7a957a',
          500: '#5a7a5a',
          600: '#466246',
          700: '#384e38',
          800: '#2d3f2d',
          900: '#243324',
        },
        warm: {
          50: '#faf9f7',
          100: '#f5f2ed',
          200: '#e8e1d5',
          300: '#d9cdb8',
          400: '#c4b49a',
          500: '#a89478',
          600: '#8b7961',
          700: '#6f614e',
          800: '#594d3f',
          900: '#483f34',
        }
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