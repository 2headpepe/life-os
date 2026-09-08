export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      keyframes: {
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-out-right': {
          '0%':   { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(110%)' },
        },
      },
      animation: {
        'slide-in-right':  'slide-in-right 0.28s cubic-bezier(0.16,1,0.3,1) both',
        'slide-out-right': 'slide-out-right 0.22s ease-in both',
      },
      colors: {
        sphere: {
          health:    '#3B82F6',
          finance:   '#22C55E',
          home:      '#EAB308',
          relations: '#EC4899',
          career:    '#A855F7',
          leisure:   '#F97316',
          travel:    '#14B8A6',
          study:     '#EF4444',
        }
      }
    }
  },
  plugins: []
}
