/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',   // 通过 <html class="dark"> 切换
  theme: {
    extend: {
      colors: {
        // Design tokens — 与现有 CSS 变量对齐
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        surface: {
          0: '#f8fafc',
          1: '#ffffff',
          2: '#f1f5f9',
          3: '#e2e8f0',
        },
        ink: {
          primary:   '#0f172a',
          secondary: '#475569',
          tertiary:  '#94a3b8',
        },
      },
      borderRadius: {
        'card': '12px',
        'btn':  '8px',
      },
      boxShadow: {
        'card':      '0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':'0 4px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05)',
        'card-drag': '0 16px 40px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)',
      },
      fontFamily: {
        sans: ['"Inter"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 150ms ease-out',
      },
    },
  },
  plugins: [],
}
