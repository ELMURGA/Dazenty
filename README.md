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
| `CRON_SECRET` | Secreto de los avisos push (`push-cron`) y de la copia diaria (`backup-cron`) |
| `N8N_WEBHOOK_SECRET` | Secreto que n8n envía en `x-webhook-secret` a `/api/webhook-lead` |

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

## Cobros en efectivo y servicios pagados

En `/admin`, abrir **Pagos → Registrar cobro**, o usar **Registrar cobro** en
la ficha del cliente. Seleccionar cliente, importe, fecha, método y concepto
(por ejemplo, mantenimiento y hosting). Para un servicio mensual o anual,
indicar el período cubierto: las fechas inicial y final son inclusivas.
El importe anual/mensual se propone a partir de la tarifa del cliente, pero
debe comprobarse antes de guardar.

Los cobros se guardan en `payments`, aparecen en el historial de Pagos y
cuentan como ingresos en Inicio. No requieren una factura; desde Facturación
se conserva el registro de pagos asociado a una factura y su actualización
automática de saldo/estado. No crear otro cobro por el mismo pago.
Registrar efectivo no crea una factura fiscal ni modifica o cancela una
suscripción de Stripe; los datos de Stripe se muestran por separado.

Antes de desplegar esta funcionalidad, aplicar
`supabase/migrations/002_payment_coverage.sql` en el proyecto Supabase que
ya tiene la migración inicial. Añade concepto y fechas de cobertura sin
modificar pagos existentes. Pruebas de validación y regresión:

```sh
node --test tests/payments.test.js
```

---

## Panel de administración: ventas, cobros y copias (migraciones 014–019)

**Orden obligatorio al publicar:** primero aplicar las migraciones en Supabase (SQL Editor, en
este orden) y después desplegar. El código nuevo lee columnas y tablas que no existen hasta
aplicarlas; si se despliega antes, el webhook de n8n y el Inicio fallarían.

| Migración | Qué añade |
|---|---|
| `014_lead_followup.sql` | Último contacto, próximo seguimiento, canal y temperatura de cada lead |
| `015_receivables.sql` | Tabla `receivables` (cobros pendientes). Crea el cobro de 200 € de Almacenes Camu si el cliente existe |
| `016_message_templates.sql` | Tabla `message_templates` con 6 plantillas iniciales (no pisa las que edites) |
| `017_proposals.sql` | Tabla `proposals` (estado de las propuestas) |
| `018_lead_reply.sql` | `leads.replied_at` y `leads.awaiting_reply` ("ha respondido, falta contestar") |
| `019_backups_bucket.sql` | Bucket **privado** `backups` de Supabase Storage |

Todas son idempotentes (`if not exists`), activan RLS y no crean políticas públicas: solo el
backend (clave `service_role`) accede.

- **Seguimiento de leads**: Inicio → «Hoy toca contactar»; Leads → registrar contacto, notas,
  historial, fases en bloque y «Convertir en cliente». Reglas en `lib/lead-rules.js`.
- **Cobros pendientes** (`api/receivables.js`, `lib/receivable-rules.js`): lo que un cliente debe.
  Pagos → «Nuevo cobro pendiente»; «Cobrado» crea el pago en `payments` y lo enlaza (no se puede
  cobrar dos veces). Tarjeta en Inicio con los vencidos primero y aviso al móvil de lunes a
  viernes a las 10:00 (ajustable en Historias).
- **Plantillas de mensaje** (`api/message-templates.js`, `lib/message-templates.js`): menú
  Plantillas. Variables `{nombre}` `{empresa}` `{importe}` `{enlace}`. «Usar plantilla» está en la
  ficha del lead, en «Hoy toca contactar», en cada cobro y en cada renovación: rellena, deja
  editar, copia o abre WhatsApp (`wa.me`) con el texto precargado. Las variables sin valor se
  dejan visibles y se avisa antes de enviar.
- **Búsqueda global** (`api/search.js`, `lib/search.js`): botón arriba, tecla `/` o Ctrl/Cmd + K.
  Busca en la base de datos (no en lo cargado en el navegador) leads, clientes, tareas y
  oportunidades; mínimo 2 caracteres y 8 resultados por tipo. Los comodines `% _ *` cuentan como
  letras normales.
- **Propuestas** (`api/proposals.js`, `lib/proposal-rules.js`): menú Propuestas y sección en la
  ficha del lead. Estados enviada, vista, aceptada, rechazada y caducada. Una abierta (enviada o
  vista) sin movimiento en 5 días hace aparecer a su lead en «Hoy toca contactar». Al aceptarla se
  ofrece convertir el lead en cliente. Crear una propuesta mueve a «propuesta» a un lead que aún
  estaba en una fase temprana.
- **Ha respondido, falta contestar**: botón en la lista y en la ficha del lead. Esos leads van
  los primeros de «Hoy toca contactar» con una etiqueta roja; registrar un contacto lo quita. n8n
  puede activarlo con `{ "action": "update", "external_id": "…", "mark_replied": true }` en
  `/api/webhook-lead` (`false` lo quita).
- **Renovaciones de mantenimiento**: bloque en Inicio con los servicios cuya cobertura
  (`coverage_end`) vence en 60 días. Usa la misma regla que las oportunidades de renovación
  (`coverageRenewal` en `lib/opportunity-rules.js`).
- **Copia de seguridad** (`api/backup-cron.js`, `lib/backup.js`): cada madrugada (`vercel.json`,
  3:00 UTC) vuelca en JSON leads, clients, payments, opportunities, tasks, events, activities,
  receivables, proposals y message_templates en el bucket privado `backups` y conserva las 30
  últimas. En Ajustes se ve la última copia y hay un botón «Hacer copia ahora». Los logs solo
  llevan nombres de tabla y recuentos. Necesita `CRON_SECRET` en Vercel (Vercel lo envía solo
  como `Authorization: Bearer …`; es el mismo que usa `push-cron`). **Las copias incluyen datos
  de clientes (también `portal_token`)**: el bucket debe seguir siendo privado.

### Pruebas

```sh
node --test tests/*.test.js
```

Los tests ejecutan los endpoints reales contra un Supabase de mentira en memoria
(`tests/helpers/fake-supabase.js`).

Para revisar el panel en local con datos inventados (nunca toca la base de datos real):

```sh
node tools/admin-mock-server.mjs   # http://localhost:4180/admin · contraseña: secret-pass
```

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
