# Dazenty — Sitio web + Portal de clientes

Sitio corporativo y sistema de portal privado para clientes de **Dazenty**, agencia de diseño web y marketing digital.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 semántico, Tailwind CSS, animaciones nativas, Lenis solo en escritorio |
| Backend / API | Vercel Serverless Functions (Node.js ESM) |
| Base de datos | Supabase (PostgreSQL + Storage) |
| Pagos | Stripe (Payment Links + Webhooks) |
| Emails | Resend |
| Deploy | Vercel |

---

## Estructura

```
Dazenty/
├── index.html           → Web corporativa pública
├── portal.html          → Portal privado del cliente
├── admin.html           → Panel de administración (protegido con contraseña)
├── api/
│   ├── clients.js           → CRUD clientes (Supabase)
│   ├── client-submit.js     → Formulario de contacto del portal
│   ├── contact.js           → Formulario de contacto público
│   ├── get-doc.js           → Descarga de PDFs desde Supabase Storage
│   ├── stripe-create-link.js → Generación de Payment Links de Stripe
│   ├── stripe-webhook.js    → Webhook de Stripe (pagos + emails)
│   ├── stripe-cancel.js     → Cancelación de suscripciones
│   └── upload.js            → Subida de PDFs a Supabase Storage
├── css/
│   ├── main.css
│   └── site.min.css      → CSS público compilado y minificado
├── input.css            → Entrada del CSS público
├── tailwind.config.js    → Clases utilizadas en las páginas públicas
├── js/
│   ├── main.js
│   └── analytics.js      → Analítica diferida con cola de eventos
├── fonts/               → Fuentes WOFF2 locales y licencias OFL
├── html/                → Páginas legales y proyectos
├── img/                 → Imágenes WebP
├── proyectos/           → Imágenes de proyectos WebP
├── manifest.json
├── robots.txt
├── sitemap.xml
└── vercel.json
```

---

## Variables de entorno

Configurar en **Vercel → Settings → Environment Variables**:

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto de Supabase |
| `SUPABASE_SERVICE_KEY` | Clave `service_role` de Supabase |
| `ADMIN_PASSWORD` | Contraseña de acceso al panel `/admin` |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret del webhook de Stripe (`whsec_...`) |
| `RESEND_API_KEY` | API key de Resend para envío de emails |

---

## Cómo funciona el portal de clientes

1. Desde `/admin` se crea un cliente con su servicio, importes y PDFs
2. Se genera automáticamente el Payment Link de Stripe
3. Se envía al cliente la URL `https://dazenty.com/portal?id=slug`
4. El cliente ve su propuesta, elige plan y paga directamente
5. Stripe dispara el webhook → se actualiza Supabase → se envían emails de confirmación

---

## Webhook de Stripe

Endpoint: `https://dazenty.com/api/stripe-webhook`

Eventos registrados:
- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.deleted`

---

## Deploy

Cualquier push a `main` despliega automáticamente en Vercel.

URL: https://dazenty.com

---

## Rendimiento y compilación del sitio público

Después de cambiar HTML, clases Tailwind o CSS, ejecutar:

```sh
npm run build:css
```

Publicar también `css/site.min.css`, las fuentes y las imágenes nuevas. `input.css`
y `tailwind.config.js` son fuentes de compilación y deben mantenerse en Git.
El portal privado y el panel de administración conservan su configuración independiente.

- Las páginas públicas usan una sola hoja de estilos minificada y fuentes locales
  Inter y Space Grotesk. Las licencias se incluyen en `fonts/`.
- No hay pantalla de carga que tape el contenido. En móvil, la cabecera principal
  se muestra sin animaciones de entrada; el desplazamiento es nativo.
- La portada no descarga GSAP ni ScrollTrigger. Las animaciones de escritorio
  se activan al entrar en pantalla y respetan la preferencia de movimiento reducido.
- El carrusel mantiene una altura estable, sin medir el diseño en cada transición,
  y solo avanza automáticamente cuando está visible.
- Google Analytics y Vercel Analytics se cargan después de `load`, en un periodo
  libre del navegador. Los eventos se encolan mientras cargan; no se elimina la
  medición ni se retrasa artificialmente hasta un clic para mejorar Lighthouse.
- El logo tiene una versión de 160 px y las imágenes destacadas ofrecen variantes
  de 720 px mediante `srcset`, conservando los originales para pantallas grandes.

Vercel configura caché inmutable para los recursos estáticos. Al modificar un
CSS o JS publicado, incrementar su parámetro `?v=` en **todas** las páginas que
lo usan. Para imágenes y fuentes nuevas, utilizar nombres versionados.

Para comparar rendimiento, usar Lighthouse móvil con caché fría y las mismas
condiciones de red/CPU antes y después, repetir las mediciones y validar también
en WebKit. PageSpeed analiza la versión **publicada**, no los cambios locales.
Los resultados varían según red, CPU y scripts externos; no hay garantía de un
100 constante ni equivalencia entre la puntuación de Chrome y un iPhone real.

---

© 2026 Dazenty. Todos los derechos reservados.
