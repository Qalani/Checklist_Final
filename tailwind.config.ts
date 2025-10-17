import type { Config } from "tailwindcss";

const withOpacityValue = (variable: string) => {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`;
    }

    return `rgb(var(${variable}))`;
  };
};

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
          50: withOpacityValue("--color-zen-50"),
          100: withOpacityValue("--color-zen-100"),
          200: withOpacityValue("--color-zen-200"),
          300: withOpacityValue("--color-zen-300"),
          400: withOpacityValue("--color-zen-400"),
          500: withOpacityValue("--color-zen-500"),
          600: withOpacityValue("--color-zen-600"),
          700: withOpacityValue("--color-zen-700"),
          800: withOpacityValue("--color-zen-800"),
          900: withOpacityValue("--color-zen-900"),
        },
        sage: {
          50: withOpacityValue("--color-sage-50"),
          100: withOpacityValue("--color-sage-100"),
          200: withOpacityValue("--color-sage-200"),
          300: withOpacityValue("--color-sage-300"),
          400: withOpacityValue("--color-sage-400"),
          500: withOpacityValue("--color-sage-500"),
          600: withOpacityValue("--color-sage-600"),
          700: withOpacityValue("--color-sage-700"),
          800: withOpacityValue("--color-sage-800"),
          900: withOpacityValue("--color-sage-900"),
        },
        warm: {
          50: withOpacityValue("--color-warm-50"),
          100: withOpacityValue("--color-warm-100"),
          200: withOpacityValue("--color-warm-200"),
          300: withOpacityValue("--color-warm-300"),
          400: withOpacityValue("--color-warm-400"),
          500: withOpacityValue("--color-warm-500"),
          600: withOpacityValue("--color-warm-600"),
          700: withOpacityValue("--color-warm-700"),
          800: withOpacityValue("--color-warm-800"),
          900: withOpacityValue("--color-warm-900"),
        },
        surface: withOpacityValue("--color-surface"),
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