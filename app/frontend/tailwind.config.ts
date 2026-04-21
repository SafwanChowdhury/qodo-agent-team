import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Status colors tuned for light theme
        'clr-green': '#2D6A2D',
        'clr-red': '#B71C1C',
        'clr-yellow': '#8B6914',
        'clr-purple': '#6B2D6B',
        'clr-orange': '#8B4513',
        'clr-accent': '#5C1A1A',
        // Semantic text shortcuts
        'text-primary': '#2C1810',
        'text-secondary': '#7A5C4A',
        'text-muted': '#A08570',
        // Surface shades
        'surface-1': '#F9F6F1',
        'surface-2': '#F3EDE3',
        'surface-3': '#EDE5D8',
        // Terminal (stays dark)
        'terminal-bg': '#1C0808',
        'terminal-border': '#3A1515',
        'terminal-text': '#F0E6E0',
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      fontFamily: {
        mono: ['SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['"Inter Tight"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        pulse: 'pulse 1.5s infinite',
        spin: 'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
