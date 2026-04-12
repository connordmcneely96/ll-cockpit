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
        navy: {
          DEFAULT: '#07091a',
          2: '#0d1230',
          3: '#111936',
          4: '#1a2245',
        },
        gold: '#f5c842',
        cyan: '#00d4ff',
        green: '#2ed573',
        red: '#ff4757',
        text1: '#ffffff',
        text2: '#b8c4e0',
        text3: '#6b7a99',
      },
      borderColor: {
        DEFAULT: 'rgba(245, 200, 66, 0.12)',
        gold: 'rgba(245, 200, 66, 0.12)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        condensed: ['var(--font-condensed)', 'ui-sans-serif', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
      },
      animation: {
        'cursor-blink': 'cursor-blink 1s step-end infinite',
      },
      keyframes: {
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
