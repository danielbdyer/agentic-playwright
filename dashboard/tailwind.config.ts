import type { Config } from 'tailwindcss';

export default {
  content: ['./dashboard/src/**/*.{ts,tsx}', './dashboard/index.html'],
  theme: {
    extend: {
      colors: {
        // GitHub dark palette — base surface system
        surface: { DEFAULT: '#0d1117', raised: '#161b22', border: '#30363d', hover: '#21262d' },
        fg: { DEFAULT: '#c9d1d9', muted: '#8b949e', bright: '#f0f6fc' },

        // Semantic governance — encodes approval state
        gov: { approved: '#3fb950', review: '#d29922', blocked: '#f85149' },

        // Actor identity — encodes who is acting
        actor: { system: '#58a6ff', agent: '#bc8cff', operator: '#d29922' },

        // Rung spectrum — deterministic (green) → unresolved (red)
        rung: {
          explicit: '#3fb950', control: '#2ea043',
          knowledge: '#56d364', patterns: '#79c0ff',
          evidence: '#a5d6ff', equivalent: '#58a6ff',
          translation: '#d29922', dom: '#e3b341',
          agent: '#bc8cff', human: '#f85149',
        },
      },
      animation: {
        'stage-pulse': 'stage-pulse 1s ease-in-out infinite',
        'fiber-pulse': 'fiber-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'stage-pulse': { '50%': { transform: 'scale(1.3)', opacity: '0.7' } },
        'fiber-pulse': { '50%': { opacity: '0.5' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
