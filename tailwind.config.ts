import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#0a0b0f',
          1: '#0d0f1a',
          2: '#111320',
          3: '#161928',
          4: '#1c2035',
          5: '#232840',
        },
        blue: {
          DEFAULT: '#3b82f6',
          dim: '#1d4ed8',
          bright: '#60a5fa',
          glow: 'rgba(59,130,246,0.15)',
        },
        gold: '#f5c842',
        cyan: '#06b6d4',
        green: '#10b981',
        red: '#ef4444',
        verdict: '#8B7BE8',  // nexus-shell --nx-verdict — infeasible (frozen)
        pending: '#828D9C',  // nexus-shell --nx-pending — ungrounded/NULL resting (AA-checked)
        text1: '#e2e8f0',
        text2: '#94a3b8',
        text3: '#4b5563',
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.06)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        condensed: ['var(--font-condensed)', 'ui-sans-serif', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
      },
      animation: {
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'dot-bounce': 'dot-bounce 1.4s ease-in-out infinite both',
      },
      keyframes: {
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'dot-bounce': {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
