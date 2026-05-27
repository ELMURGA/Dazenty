# Dazenty — Sitio web + Portal de clientes

Sitio corporativo y sistema de portal privado para clientes de **Dazenty**, agencia de diseño web y marketing digital.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 semántico, Tailwind CSS, GSAP 3, Lenis |
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
│   └── tailwind.min.css
├── js/main.js
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

© 2026 Dazenty. Todos los derechos reservados.
