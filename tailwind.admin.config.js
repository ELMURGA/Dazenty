/** Tailwind del panel /admin: se compila a css/admin.min.css (antes se compilaba en el navegador). */
module.exports = {
  content: ['./admin.html', './js/admin-jobs.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'], display: ['Space Grotesk', 'sans-serif'] },
      colors: { brand: { blue: '#d97762', dark: '#050505', gray: '#121212', card: '#0e0e0e', light: '#EAEAEA' } },
    },
  },
  plugins: [],
};
