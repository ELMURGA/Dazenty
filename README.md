# 🚀 Dazenty - Agencia Digital Moderna

<div align="center">

![Dazenty Logo](img/logo.png)

### Diseño Web • Branding • Marketing Digital

[![Live Demo](https://img.shields.io/badge/demo-live-success.svg)](https://dazenty.vercel.app/)
[![Status](https://img.shields.io/badge/status-active-brightgreen.svg)]()
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black.svg)](https://vercel.com)

**[🌐 Ver Sitio Web →](https://dazenty.vercel.app/)**

</div>

---

## 📖 Sobre Dazenty

**Dazenty** es una agencia digital de nueva generación especializada en crear experiencias visuales únicas e impactantes. Ofrecemos soluciones integrales de diseño web, branding y marketing digital para empresas que buscan destacar en el ecosistema digital.

### 🎯 Nuestros Servicios

- **💻 Desarrollo Web**: Sitios web modernos, responsive y optimizados para SEO
- **🎨 Diseño Gráfico**: Branding, identidad corporativa y material visual
- **📈 Marketing Digital**: Estrategias SEO, redes sociales y publicidad online

---

## ✨ Características del Sitio

### 🎨 Diseño y UX
- ✅ **Diseño Moderno Inspirado en April Ford**: Estética minimalista y profesional
- ✅ **Totalmente Responsive**: Optimizado para móviles, tablets y desktop
- ✅ **Animaciones Fluidas**: Efectos con GSAP y Lenis Smooth Scroll
- ✅ **Cursor Personalizado**: Interacciones visuales únicas
- ✅ **Page Loader Animado**: Pantalla de carga con descomposición de letras

### ⚡ Rendimiento
- ✅ **Imágenes WebP**: Formato optimizado para carga rápida
- ✅ **Lazy Loading**: Carga diferida de recursos
- ✅ **CSS Unificado**: Un solo archivo CSS para todo el sitio
- ✅ **JavaScript Optimizado**: Código modular y eficiente

### 🔍 SEO
- ✅ **Meta Tags Completos**: Títulos, descripciones y keywords optimizados
- ✅ **Open Graph**: Integración para redes sociales
- ✅ **Sitemap.xml**: Mapa del sitio actualizado
- ✅ **Robots.txt**: Configuración para crawlers
- ✅ **URLs Canónicas**: Evita contenido duplicado

---

## 🛠️ Stack Tecnológico

### Frontend
| Tecnología | Uso |
|------------|-----|
| **HTML5** | Estructura semántica |
| **Tailwind CSS** | Framework CSS utility-first |
| **JavaScript ES6+** | Interactividad y lógica |

### Librerías
| Librería | Propósito |
|----------|-----------|
| **GSAP + ScrollTrigger** | Animaciones avanzadas y scroll effects |
| **Lenis** | Smooth scrolling suave y natural |
| **Google Fonts** | Tipografías Space Grotesk e Inter |

### Deployment
- **Vercel**: Hosting y CI/CD automático
- **Git**: Control de versiones

---

## 📁 Estructura del Proyecto

```
dazenty/
├── index.html                    # Página principal
├── css/
│   └── main.css                  # Estilos globales unificados
├── js/
│   └── main.js                   # JavaScript global (Lenis, GSAP, cursor)
├── html/
│   ├── portfolio.html            # Galería de proyectos
│   ├── about.html                # Sobre nosotros
│   ├── pagina_desarrollo_web.html
│   ├── pagina_diseno_grafico.html
│   ├── pagina_marketing_digital.html
│   ├── proyecto-desarrollo-web.html
│   ├── proyecto-diseno-grafico.html
│   ├── proyecto-marketing-digital.html
│   ├── privacidad.html           # Política de privacidad
│   └── terminos.html             # Términos y condiciones
├── img/
│   ├── logo.png                  # Logo principal
│   └── webp/                     # Imágenes optimizadas en WebP
├── sitemap.xml                   # Mapa del sitio
├── robots.txt                    # Directivas para bots
├── manifest.json                 # PWA manifest
└── vercel.json                   # Configuración de Vercel
```

---

## 🚀 Instalación y Uso Local

### Prerrequisitos
- Navegador web moderno
- Servidor local (opcional): Live Server, Python HTTP, etc.

### Opción 1: Abrir directamente
```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/dazenty.git
cd dazenty

# Abrir index.html en el navegador
open index.html
```

### Opción 2: Con Live Server (VS Code)
```bash
# Instalar extensión Live Server en VS Code
# Click derecho en index.html > "Open with Live Server"
```

### Opción 3: Con Python
```bash
# Python 3
python -m http.server 8000

# Abrir en navegador
http://localhost:8000
```

---

## 📊 Páginas del Sitio

### Páginas Principales
1. **Home** (`index.html`) - Landing principal con hero, servicios y contacto
2. **Portfolio** (`html/portfolio.html`) - Galería de proyectos con filtros
3. **About** (`html/about.html`) - Historia y valores de la agencia

### Páginas de Servicios
4. **Desarrollo Web** (`html/pagina_desarrollo_web.html`)
5. **Diseño Gráfico** (`html/pagina_diseno_grafico.html`)
6. **Marketing Digital** (`html/pagina_marketing_digital.html`)

### Case Studies
7. **NextGen Commerce** (`html/proyecto-desarrollo-web.html`)
8. **Nova Identity** (`html/proyecto-diseno-grafico.html`)
9. **Growth 360** (`html/proyecto-marketing-digital.html`)

### Páginas Legales
10. **Privacidad** (`html/privacidad.html`)
11. **Términos** (`html/terminos.html`)

---

## 🎨 Paleta de Colores

```css
--brand-blue: #00BFFF;    /* Azul primario */
--brand-dark: #050505;    /* Negro de fondo */
--brand-gray: #121212;    /* Gris oscuro */
--white: #FFFFFF;         /* Blanco */
```

---

## 🔧 Personalización

### Cambiar Colores
Edita el archivo `css/main.css` o la configuración de Tailwind en cada HTML:
```javascript
colors: {
    brand: {
        blue: '#00BFFF',
        dark: '#050505',
        gray: '#121212'
    }
}
```

### Actualizar Contenido
- **Textos**: Editar directamente en los archivos HTML
- **Imágenes**: Reemplazar en carpeta `img/webp/`
- **Logo**: Actualizar `img/logo.png`

---

## 📈 SEO y Rendimiento

### Optimizaciones Implementadas
- ✅ Meta tags en todas las páginas
- ✅ Imágenes en formato WebP
- ✅ Lazy loading de imágenes
- ✅ CSS y JS minificados
- ✅ Sitemap XML actualizado
- ✅ Robots.txt configurado
- ✅ URLs canónicas

### Lighthouse Score Objetivo
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

---

## 📞 Contacto

- **Email**: designerazenty@gmail.com
- **Teléfono**: 676 448 762
- **Instagram**: [@dazen.ty](https://www.instagram.com/dazen.ty)
- **LinkedIn**: [Alejandro Hernández Murga](https://www.linkedin.com/in/alejandro-hernández-murga)
- **Twitter**: [@DAzenty](https://twitter.com/DAzenty)

---

## 📄 Licencia

© 2026 Dazenty. Todos los derechos reservados.

---

<div align="center">

**Hecho con ❤️ por Dazenty**

[🌐 Visita nuestro sitio](https://dazenty.vercel.app/) | [📧 Contáctanos](mailto:designerazenty@gmail.com)

</div>
├── img/                    # Imágenes
│   └── webp/               # Imágenes optimizadas
├── js/
│   └── main.js
└── vercel.json             # Configuración de Vercel
```

## 🎯 Servicios

- **Diseño Gráfico**: Logos, identidad corporativa, material publicitario
- **Desarrollo Web**: Páginas web, e-commerce, aplicaciones
- **Marketing Digital**: SEO, redes sociales, publicidad digital

## 🚀 Despliegue

El sitio está desplegado automáticamente en **Vercel**:

🔗 **https://dazenty.vercel.app/**

## 📞 Contacto

- 📧 Email: designerazenty@gmail.com
- 📱 Teléfono: 676 448 762
- 📸 Instagram: [@dazen.ty](https://www.instagram.com/dazen.ty)

---

<div align="center">

**© 2024 Dazenty. Todos los derechos reservados.**

</div>
