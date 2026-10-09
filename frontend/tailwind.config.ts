import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00C3FF',
          hover: '#00A8DB',
          light: '#66DAFF',
          bg: '#E5F8FF',
        },
        secondary: {
          DEFAULT: '#35C838',
          hover: '#2BAF2E',
        },
        accent: {
          DEFAULT: '#F3A6FF',
          bg: '#FDF0FF',
        },
        dark: {
          DEFAULT: '#171717',
          secondary: '#252525',
        },
        text: {
          DEFAULT: '#171717',
          secondary: '#636E7B',
          muted: '#8B949E',
        },
        border: {
          DEFAULT: '#D0D7DE',
          light: '#E8EAED',
        },
        surface: '#F6F8FA',
        danger: '#E74C3C',
        warning: '#F39C12',
        info: '#3498DB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out both',
        'slide-up': 'slideUp 0.2s ease-out',
        'sheet-up': 'sheetUp 0.3s ease-out',
        'sheet-down': 'sheetDown 0.2s ease-in',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'progress-glow': 'progressGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        modalEnter: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        sheetUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        sheetDown: {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.35)' },
        },
        progressGlow: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
