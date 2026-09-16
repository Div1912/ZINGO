import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        serif: ['Newsreader', 'Tiempos Headline', 'Copernicus', 'Charter', 'Georgia', 'Cambria', 'serif'],
        claude: ['Newsreader', 'Tiempos Headline', 'Copernicus', 'Charter', 'Georgia', 'Cambria', 'serif'],
      },
      colors: {
        // AIRA Base Palette
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        overlay: 'var(--bg-overlay)',
        border: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          text: 'var(--accent-text)',
        },
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',

        // Shadcn UI Compatibility Palette
        background: 'var(--bg-page)',
        foreground: 'var(--text-primary)',
        card: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        primary: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-text)',
        },
        secondary: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--text-secondary)',
        },
        destructive: {
          DEFAULT: 'var(--danger)',
          foreground: '#FFFFFF',
        },
        ring: 'var(--border-strong)',
        input: 'var(--border-default)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.5', fontWeight: '400' }],
        sm: ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        base: ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        lg: ['17px', { lineHeight: '1.5', fontWeight: '500' }],
        xl: ['22px', { lineHeight: '1.3', fontWeight: '500' }],
        '2xl': ['28px', { lineHeight: '1.2', fontWeight: '600' }],
        '3xl': ['38px', { lineHeight: '1.1', fontWeight: '600' }],
        hero: ['56px', { lineHeight: '1.05', fontWeight: '600', letterSpacing: '-0.03em' }],
      },
      keyframes: {
        'border-beam': {
          '100%': {
            'offset-distance': '100%',
          },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(0.97)' },
        },
        'orb-float': {
          '0%, 100%': { transform: 'translateY(0px) scale(1)' },
          '50%': { transform: 'translateY(-6px) scale(1.05)' },
        },
      },
      animation: {
        'border-beam': 'border-beam calc(var(--duration)*1s) infinite linear',
        'spin-slow': 'spin-slow 20s linear infinite',
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
        'orb-float': 'orb-float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
