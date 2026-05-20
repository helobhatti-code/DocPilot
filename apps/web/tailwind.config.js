/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── CSS-var mapped tokens (theme-aware) ── */
        bg: {
          primary: 'var(--bg-primary)',
          card:    'var(--bg-card)',
          input:   'var(--bg-input)',
          sidebar: 'var(--sidebar-bg)',
        },
        border: 'var(--border)',
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        accent: {
          primary:      'var(--accent-primary)',
          'primary-hover': 'var(--accent-primary-hover)',
          'primary-light': 'var(--accent-primary-light)',
          blue:         'var(--accent-blue)',
          'blue-dark':  'var(--accent-blue-dark)',
        },

        /* ── Static brand palette (use anywhere) ── */
        brand: {
          navy:         '#0B2545',
          blue:         '#1B5299',
          mid:          '#2D7DD2',
          light:        '#EEF4FD',
          slate:        '#334E72',
          orange:       '#F47316',
          'orange-dark': '#D96810',
          'orange-light': '#FEF0E6',
        },

        /* ── Status colours ── */
        status: {
          valid:     '#48BB78',
          warning:   '#ECC94B',
          expiring:  '#F47316',   /* Brand Orange */
          expired:   '#FC5185',
          cancelled: '#334E72',   /* Brand Slate */
          completed: '#2D7DD2',   /* Brand Mid */
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },

      boxShadow: {
        card:       '0 1px 3px 0 rgba(11,37,69,0.08), 0 4px 16px 0 rgba(11,37,69,0.06)',
        'card-hover':'0 4px 12px 0 rgba(11,37,69,0.12), 0 16px 40px 0 rgba(11,37,69,0.10)',
      },

      lineHeight: {
        heading: '1.2',
        body:    '1.6',
      },

      letterSpacing: {
        heading: '-0.02em',
        label:   '0.08em',
      },

      backdropBlur: {
        xs: '12px',
        sm: '16px',
        md: '20px',
        lg: '24px',
      },
    },
  },
  plugins: [],
};
