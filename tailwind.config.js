/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './404.html',
        './html/*.html',
        './js/main.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Space Grotesk', 'sans-serif'],
            },
            colors: {
                brand: {
                    blue: '#d97762',
                    dark: '#050505',
                    gray: '#121212',
                    light: '#EAEAEA'
                }
            },
            maxWidth: {
                'screen-2xl': '1440px',
            }
        }
    },
    plugins: [],
}
