/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        paper: '#f1e7cf',
        'paper-dark': '#e6d9b8',
        'paper-deep': '#d8c89e',
        ink: '#1a2e24',
        'ink-soft': '#3d4f44',
        moss: '#5b7246',
        rust: '#9b3d1e',
        ochre: '#b8893a',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        widest2: '0.28em',
      },
    },
  },
  plugins: [],
};
