// api/stripe-webhook.js — Notificación de pago confirmado por Stripe
// ==========================================================
// POST /api/stripe-webhook
// Registrar en Stripe Dashboard: https://dashboard.stripe.com/webhooks
// URL del webhook: https://dazenty.com/api/stripe-webhook
// Eventos a escuchar: checkout.session.completed, invoice.paid
// ==========================================================

import { createHmac, timingSafeEqual } from 'crypto';

export const config = {
  api: {
    bodyParser: false, // Necesario para verificar la firma de Stripe
  },
};

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const RESEND_KEY             = process.env.RESEND_API_KEY;
const SB_URL                 = process.env.SUPABASE_URL;
const SB_KEY                 = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL            = 'designerazenty@gmail.com';

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(amount, currency = 'eur') {
  const num = (amount / 100).toFixed(2);
  return currency === 'eur' ? `${num}€` : `${num} ${currency.toUpperCase()}`;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verifica la firma de Stripe (HMAC-SHA256)
function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const parts = signature.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const t  = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  // Tolerancia de 5 minutos para evitar replay attacks
  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(t, 10));
  if (timestampAge > 300) return false;

  const signedPayload = `${t}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody   = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  // Si no hay webhook secret configurado, logueamos y rechazamos (no procesar sin verificar)
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET no está configurado en las variables de entorno de Vercel');
    return res.status(500).json({ error: 'Webhook secret no configurado' });
  }

  if (!verifySignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    console.warn('[stripe-webhook] Firma inválida. Signature header:', signature?.substring(0, 40));
    return res.status(400).json({ error: 'Firma inválida' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Cuerpo inválido' });
  }

  const type = event.type;
  console.log('[stripe-webhook] Evento recibido:', type, '| ID:', event.id);

  // ── checkout.session.completed — primer pago (único o suscripción nueva) ──
  if (type === 'checkout.session.completed') {
    const session = event.data.object;

    let nextBillingDate = null;

    // Si es suscripción, guardar el ID en Supabase y obtener próximo cobro
    if (session.mode === 'subscription' && session.subscription && session.payment_link) {
      await saveSubscriptionFromPaymentLink(session.payment_link, session.subscription);
      // Obtener el período actual para informar al cliente
      try {
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
          headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
        });
        const sub = await subRes.json();
        if (sub.current_period_end) {
          nextBillingDate = new Date(sub.current_period_end * 1000)
            .toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      } catch (e) {
        console.error('[stripe-webhook] Error obteniendo subscription para nextBillingDate:', e);
      }
    }

    await sendPaymentEmail({
      type: 'Pago completado',
      customerEmail:   session.customer_details?.email || session.customer_email || '—',
      customerName:    session.customer_details?.name  || '—',
      amount:          formatAmount(session.amount_total, session.currency),
      mode:            session.mode === 'subscription' ? 'Suscripción nueva' : 'Pago único',
      paymentLinkId:   session.payment_link || '—',
      sessionId:       session.id,
      nextBillingDate,
    });
  }

  // ── invoice.paid — cobro recurrente de suscripción ──────────────────────
  if (type === 'invoice.paid') {
    const invoice = event.data.object;

    let nextBillingDate = null;
    // Actualizar fecha de próximo cargo
    if (invoice.subscription && invoice.lines?.data?.[0]?.period?.end) {
      const periodEnd = invoice.lines.data[0].period.end;
      await updateClientPeriodEnd(invoice.subscription, periodEnd);
      nextBillingDate = new Date(periodEnd * 1000)
        .toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    const isFirstPayment = invoice.billing_reason === 'subscription_create';
    if (!isFirstPayment) { // Los primeros ya se notifican vía checkout.session.completed
      await sendPaymentEmail({
        type: 'Cobro recurrente de suscripción',
        customerEmail:   invoice.customer_email || '—',
        customerName:    invoice.customer_name  || '—',
        amount:          formatAmount(invoice.amount_paid, invoice.currency),
        mode:            'Suscripción (renovación)',
        paymentLinkId:   '—',
        sessionId:       invoice.id,
        nextBillingDate,
      });
    }
  }

  // ── customer.subscription.deleted — suscripción cancelada definitivamente ──
  if (type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await updateClientSubscriptionStatus(sub.id, 'canceled');
  }

  return res.status(200).json({ received: true });
}

// ─── Supabase: guardar suscripción al completar pago ─────────────────────────
async function saveSubscriptionFromPaymentLink(paymentLinkId, subscriptionId) {
  if (!SB_URL || !SB_KEY || !STRIPE_SECRET_KEY) {
    console.error('[stripe-webhook] saveSubscriptionFromPaymentLink: faltan variables de entorno', { SB_URL: !!SB_URL, SB_KEY: !!SB_KEY, STRIPE_SECRET_KEY: !!STRIPE_SECRET_KEY });
    return;
  }
  try {
    // Obtener metadata del payment link (contiene client_slug)
    const plRes = await fetch(`https://api.stripe.com/v1/payment_links/${paymentLinkId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const pl = await plRes.json();
    const slug = pl?.metadata?.client_slug;
    console.log('[stripe-webhook] Payment link metadata slug:', slug, '| paymentLinkId:', paymentLinkId);
    if (!slug) {
      console.error('[stripe-webhook] Sin client_slug en metadata del payment link:', JSON.stringify(pl?.metadata));
      return;
    }

    // Obtener el período actual de la suscripción
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const sub = await subRes.json();

    await fetch(`${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        stripe_subscription_id:     subscriptionId,
        stripe_subscription_status: 'active',
        stripe_current_period_end:  sub.current_period_end || null,
        updated_at: new Date().toISOString(),
      }),
    }).then(async r => {
      if (!r.ok) {
        const txt = await r.text();
        console.error('[stripe-webhook] Error PATCH Supabase:', r.status, txt);
      } else {
        console.log('[stripe-webhook] Supabase actualizado OK para slug:', slug, '| sub:', subscriptionId);
      }
    });
  } catch (err) {
    console.error('[stripe-webhook] saveSubscriptionFromPaymentLink error:', err);
  }
}

async function updateClientPeriodEnd(subscriptionId, periodEnd) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/clients?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ stripe_current_period_end: periodEnd, updated_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('[stripe-webhook] updateClientPeriodEnd error:', err);
  }
}

async function updateClientSubscriptionStatus(subscriptionId, status) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/clients?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ stripe_subscription_status: status, updated_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('[stripe-webhook] updateClientSubscriptionStatus error:', err);
  }
}

async function sendPaymentEmail({ type, customerEmail, customerName, amount, mode, paymentLinkId, sessionId, nextBillingDate }) {
  if (!RESEND_KEY) {
    console.error('[stripe-webhook] RESEND_API_KEY no está configurado en las variables de entorno de Vercel — no se envían emails');
    return;
  }

  const isRecurring = mode.toLowerCase().includes('renovación');
  const modeLabel   = isRecurring ? 'Renovación de suscripción' : mode;

  // ── Email de confirmación al CLIENTE ────────────────────────────────────
  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Confirmación de pago — Dazenty</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:48px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- LOGO -->
  <tr><td align="center" style="padding-bottom:36px">
    <img src="https://dazenty.com/img/logoheader.webp" alt="Dazenty" height="60" style="height:60px;width:auto;display:block">
  </td></tr>

  <!-- CARD PRINCIPAL -->
  <tr><td style="background:#111111;border:1px solid #1e1e1e;border-radius:20px;overflow:hidden">
    <!-- Línea de acento superior -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="30%" style="height:3px;background:#111111"></td>
      <td width="40%" style="height:3px;background:#d97762"></td>
      <td width="30%" style="height:3px;background:#111111"></td>
    </tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:40px 36px">

      <!-- Etiqueta + Título -->
      <tr><td style="padding-bottom:6px">
        <p style="margin:0;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Confirmación de pago</p>
      </td></tr>
      <tr><td style="padding-bottom:10px">
        <h1 style="margin:0;font-size:30px;color:#eaeaea;font-weight:700;line-height:1.15">¡Tu plan está activo!</h1>
      </td></tr>
      <tr><td style="padding-bottom:36px">
        <p style="margin:0;font-size:15px;color:#666;line-height:1.65">Hemos recibido tu pago correctamente. Tu web con Dazenty sigue activa, segura y gestionada.</p>
      </td></tr>

      <!-- Importe destacado -->
      <tr><td style="padding-bottom:32px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:14px">
          <tr><td align="center" style="padding:28px 24px">
            <p style="margin:0 0 6px;font-size:11px;color:#555;letter-spacing:2px;text-transform:uppercase">Importe cobrado</p>
            <p style="margin:0;font-size:52px;color:#d97762;font-weight:700;line-height:1;letter-spacing:-1px">${esc(amount)}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#444">${esc(modeLabel)}</p>
          </td></tr>
        </table>
      </td></tr>

      <!-- Desglose -->
      <tr><td style="padding-bottom:10px">
        <p style="margin:0 0 16px;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Desglose del pago</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px;width:48%">Servicio</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">Hosting Profesional — Dazenty</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Nombre</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(customerName)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Email</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(customerEmail)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Tipo de pago</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(modeLabel)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;color:#444;font-size:12px">Referencia</td>
            <td style="padding:11px 0;color:#333;font-size:11px;text-align:right;font-family:'Courier New',monospace">${esc(sessionId)}</td>
          </tr>
          ${nextBillingDate ? `<tr>
            <td style="padding:11px 0;color:#555;font-size:13px">Próximo cobro</td>
            <td style="padding:11px 0;color:#d97762;font-size:13px;text-align:right;font-weight:600">${esc(nextBillingDate)}</td>
          </tr>` : ''}
        </table>
      </td></tr>

      <!-- Qué incluye -->
      <tr><td style="padding-top:28px;padding-bottom:32px">
        <p style="margin:0 0 16px;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Tu plan incluye</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:7px 0;color:#888;font-size:13px;line-height:1.4">
            <span style="color:#d97762;margin-right:8px">✓</span>Infraestructura profesional (Vercel) — velocidad y uptime garantizados
          </td></tr>
          <tr><td style="padding:7px 0;color:#888;font-size:13px;line-height:1.4">
            <span style="color:#d97762;margin-right:8px">✓</span>Dominio y certificado SSL activos
          </td></tr>
          <tr><td style="padding:7px 0;color:#888;font-size:13px;line-height:1.4">
            <span style="color:#d97762;margin-right:8px">✓</span>Mantenimiento técnico y actualizaciones continuas
          </td></tr>
          <tr><td style="padding:7px 0;color:#888;font-size:13px;line-height:1.4">
            <span style="color:#d97762;margin-right:8px">✓</span>Soporte directo por WhatsApp
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA WhatsApp -->
      <tr><td style="padding-bottom:8px">
        <a href="https://wa.me/34624903256" style="display:block;background:#d97762;color:#050505;text-decoration:none;text-align:center;padding:15px 24px;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:0.3px">
          ¿Alguna duda? Escríbeme por WhatsApp →
        </a>
      </td></tr>

    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="padding:32px 0 0">
    <p style="margin:0 0 6px;font-size:12px;color:#333">© 2026 Dazenty &nbsp;·&nbsp; <a href="https://dazenty.com" style="color:#555;text-decoration:none">dazenty.com</a> &nbsp;·&nbsp; <a href="mailto:hola@dazenty.com" style="color:#555;text-decoration:none">hola@dazenty.com</a></p>
    <p style="margin:0;font-size:11px;color:#2a2a2a">Stripe envía automáticamente el recibo oficial a este mismo correo.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  // ── Email de notificación al ADMIN ───────────────────────────────────────
  const adminHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Nuevo pago — Dazenty</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:40px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <tr><td align="center" style="padding-bottom:28px">
    <img src="https://dazenty.com/img/logoheader.webp" alt="Dazenty" height="60" style="height:60px;width:auto;display:block">
  </td></tr>

  <tr><td style="background:#111111;border:1px solid #1e1e1e;border-radius:16px;overflow:hidden">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="25%" style="height:3px;background:#111"></td>
      <td width="50%" style="height:3px;background:#d97762"></td>
      <td width="25%" style="height:3px;background:#111"></td>
    </tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px">
      <tr><td style="padding-bottom:4px">
        <p style="margin:0;font-size:11px;color:#d97762;letter-spacing:2px;text-transform:uppercase;font-weight:600">💳 Pago recibido</p>
      </td></tr>
      <tr><td style="padding-bottom:28px">
        <h1 style="margin:0;font-size:24px;color:#eaeaea;font-weight:700">${esc(type)}</h1>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px;width:45%">Importe</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#d97762;font-size:20px;font-weight:700;text-align:right">${esc(amount)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Tipo</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(modeLabel)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Cliente</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(customerName)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Email</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;font-size:13px;text-align:right"><a href="mailto:${esc(customerEmail)}" style="color:#d97762;text-decoration:none">${esc(customerEmail)}</a></td>
          </tr>
          <tr>
            <td style="padding:11px 0;color:#444;font-size:12px">ID Stripe</td>
            <td style="padding:11px 0;color:#333;font-size:11px;text-align:right;font-family:'Courier New',monospace">${esc(sessionId)}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding-top:24px">
        <a href="https://dashboard.stripe.com/payments" style="display:inline-block;border:1px solid #2a2a2a;color:#888;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px">
          Ver en Stripe Dashboard →
        </a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:24px 0 0">
    <p style="margin:0;font-size:11px;color:#2a2a2a">Dazenty · Notificación automática</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const sends = [];

  // Enviar confirmación al cliente (si tenemos su email)
  if (customerEmail && customerEmail !== '—') {
    sends.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Dazenty <noreply@dazenty.com>',
          to: [customerEmail],
          subject: `✓ Pago confirmado — ${esc(amount)} · Dazenty`,
          html: clientHtml,
        }),
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          console.error('[stripe-webhook] Error al enviar email al CLIENTE:', JSON.stringify(err));
        } else {
          console.log('[stripe-webhook] Email de confirmación enviado al cliente:', customerEmail);
        }
      })
    );
  } else {
    console.warn('[stripe-webhook] Sin email de cliente — no se envía confirmación al cliente');
  }

  // Enviar notificación al admin
  sends.push(
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dazenty Pagos <noreply@dazenty.com>',
        to: [ADMIN_EMAIL],
        subject: `💳 ${type} — ${esc(amount)} · ${esc(customerEmail)}`,
        html: adminHtml,
      }),
    }).then(async r => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.error('[stripe-webhook] Error al enviar email al ADMIN:', JSON.stringify(err));
      } else {
        console.log('[stripe-webhook] Email de notificación enviado al admin:', ADMIN_EMAIL);
      }
    })
  );

  try {
    await Promise.all(sends);
  } catch (err) {
    console.error('[stripe-webhook] Error al enviar emails:', err);
  }
}
