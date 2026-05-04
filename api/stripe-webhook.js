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
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'designerazenty@gmail.com';

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

  const rawBody  = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  if (!verifySignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
    console.warn('[stripe-webhook] Firma inválida');
    return res.status(400).json({ error: 'Firma inválida' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Cuerpo inválido' });
  }

  const type = event.type;

  // ── checkout.session.completed — primer pago (único o suscripción nueva) ──
  if (type === 'checkout.session.completed') {
    const session = event.data.object;
    await sendPaymentEmail({
      type: 'Pago completado',
      customerEmail: session.customer_details?.email || session.customer_email || '—',
      customerName:  session.customer_details?.name  || '—',
      amount:        formatAmount(session.amount_total, session.currency),
      mode:          session.mode === 'subscription' ? 'Suscripción nueva' : 'Pago único',
      paymentLinkId: session.payment_link || '—',
      sessionId:     session.id,
    });
  }

  // ── invoice.paid — cobro recurrente de suscripción ──────────────────────
  if (type === 'invoice.paid') {
    const invoice = event.data.object;
    const isFirstPayment = invoice.billing_reason === 'subscription_create';
    if (!isFirstPayment) { // Los primeros ya se notifican vía checkout.session.completed
      await sendPaymentEmail({
        type: 'Cobro recurrente de suscripción',
        customerEmail: invoice.customer_email || '—',
        customerName:  invoice.customer_name  || '—',
        amount:        formatAmount(invoice.amount_paid, invoice.currency),
        mode:          'Suscripción (renovación)',
        paymentLinkId: '—',
        sessionId:     invoice.id,
      });
    }
  }

  return res.status(200).json({ received: true });
}

async function sendPaymentEmail({ type, customerEmail, customerName, amount, mode, paymentLinkId, sessionId }) {
  const html = `
    <div style="font-family:'Segoe UI',sans-serif;background:#050505;padding:32px;border-radius:12px;max-width:560px;margin:0 auto">
      <h2 style="color:#d97762;font-family:'Space Grotesk',sans-serif;margin-bottom:8px;font-size:22px">
        💳 ${esc(type)}
      </h2>
      <p style="color:#888;font-size:13px;margin-bottom:24px">Notificación automática del portal Dazenty</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px;width:160px">Importe</td>
            <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#d97762;font-size:20px;font-weight:700">${esc(amount)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Tipo</td>
            <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(mode)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Email cliente</td>
            <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">
              <a href="mailto:${esc(customerEmail)}" style="color:#d97762">${esc(customerEmail)}</a></td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Nombre cliente</td>
            <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(customerName)}</td></tr>
        <tr><td style="padding:10px 0;color:#888;font-size:13px">ID sesión Stripe</td>
            <td style="padding:10px 0;color:#555;font-size:12px;font-family:monospace">${esc(sessionId)}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:12px;color:#555">
        Ver en Stripe: <a href="https://dashboard.stripe.com/payments" style="color:#d97762">dashboard.stripe.com</a>
      </p>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dazenty Pagos <noreply@dazenty.com>',
        to: [ADMIN_EMAIL],
        subject: `💳 ${type} — ${amount} · ${customerEmail}`,
        html,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('[stripe-webhook] Resend error:', err);
    }
  } catch (err) {
    console.error('[stripe-webhook] Error al enviar email:', err);
  }
}
