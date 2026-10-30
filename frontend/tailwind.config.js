/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        saki: {
          pink: '#ff75ac',
          'pink-hover': '#ff5b9a',
          'pink-light': 'rgba(255, 117, 172, 0.14)',
          'pink-dark': '#ff9bc8',
          rose: '#b92761',
          obsidian: '#0b0c10',
          darkcard: '#181922',
          darksurface: '#24252e',
        },
      },
      boxShadow: {
        'liquid': '0 10px 30px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
        'liquid-dark': '0 12px 36px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        'pink-glow': '0 0 20px rgba(255, 117, 172, 0.35)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
