# Dazenty - Agencia Digital

Sitio web corporativo de **Dazenty**, agencia especializada en Diseno Web, Diseno Grafico y Marketing Digital.

---

## Stack

- HTML5 semantico
- Tailwind CSS (CDN) + CSS personalizado
- GSAP 3 + ScrollTrigger
- Lenis 1.0 (smooth scroll)
- Inter + Space Grotesk (Google Fonts)
- WebP para todas las imagenes
- Deploy en Vercel

---

## Caracteristicas

- Scroll suave con Lenis: logo con scrollTo(0) animado sin saltos nativos
- Bug iOS corregido: eliminado lenis.stop/start en focus/blur que causaba salto al top al cerrar el teclado
- Modales de servicios con scroll aislado (iOS-safe)
- Cursor personalizado interactivo (solo desktop)
- Navbar flotante pill: se colapsa al bajar y se expande al volver al top
- GSAP animations: hero reveal, stagger cards, parallax proyectos, contadores
- Formulario AJAX con Formspree (sin recarga)
- PWA-ready con manifest.json
- SEO: meta tags, Open Graph, Twitter Cards, sitemap, robots.txt

---

## Estructura

```
Dazenty/
├── index.html
├── favicon.webp
├── manifest.json
├── robots.txt
├── sitemap.xml
├── vercel.json
├── css/main.css
├── js/main.js
├── img/logodazenty.webp
├── html/
│   ├── about.html
│   ├── portfolio.html
│   ├── privacidad.html
│   ├── terminos.html
│   ├── proyecto-costa-del-sol.html
│   ├── proyecto-hermanos-hervas.html
│   └── proyecto-sevilla-tp.html
└── proyectos/  (imagenes WebP)
```

---

## Modales de Servicios

Las tres tarjetas de la seccion Servicios abren modales con scroll aislado:

- Diseno Web y UI/UX: sitios corporativos, landing pages, e-commerce
- Diseno Grafico: branding, identidad visual, redes sociales
- Marketing Digital: SEO, SEM, gestion de redes, email marketing

---

## Deploy

Push a main despliega automaticamente en Vercel.

URL: https://dazenty.com

---

(c) 2026 Dazenty. Todos los derechos reservados.
