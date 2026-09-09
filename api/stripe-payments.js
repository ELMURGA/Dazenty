// api/stripe-payments.js — Resumen de pagos Stripe por cliente (ADMIN)
// ==========================================================
// GET /api/stripe-payments  → para cada cliente con suscripción en Stripe:
//                              meses pagados, total facturado, último pago
//                              y próximo cobro (datos reales leídos de Stripe)
//
// Auth admin: header  x-admin-password: <ADMIN_PASSWORD env var>
// ==========================================================

import { timingSafeEqual } from 'crypto';

const SB_URL            = process.env.SUPABASE_URL;
const SB_KEY            = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PW          = process.env.ADMIN_PASSWORD;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

// Constante-time comparison — evita timing attacks
function isAdmin(req) {
  const pass     = String(req.headers['x-admin-password'] || '');
  const expected = String(ADMIN_PW || '');
  if (!expected) return 'no_env';
  if (!pass) return false;
  const maxLen = Math.max(pass.length, expected.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.write(pass);
  b.write(expected);
  return timingSafeEqual(a, b) && pass.length === expected.length;
}

async function stripeGet(path) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `Stripe error ${r.status}`);
  return body;
}

// Cuántos meses cubre cada factura pagada según el intervalo de facturación
function monthsPerInterval(interval, intervalCount = 1) {
  if (interval === 'year')  return 12 * intervalCount;
  if (interval === 'week')  return intervalCount / 4.345;
  return intervalCount; // 'month' (y fallback)
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const adminCheck = isAdmin(req);
  if (adminCheck === 'no_env') return res.status(503).json({ error: 'ADMIN_PASSWORD no configurada en Vercel' });
  if (!adminCheck) return res.status(401).json({ error: 'No autorizado' });

  if (!SB_URL || !SB_KEY) {
    return res.status(503).json({ error: 'Variables SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas en Vercel' });
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'STRIPE_SECRET_KEY no configurada en Vercel' });
  }

  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/clients?stripe_subscription_id=not.is.null&select=id,slug,client_name,company_name,service_name,amount_monthly,amount_annual,stripe_subscription_id,stripe_subscription_status`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!sbRes.ok) {
      const errBody = await sbRes.text();
      return res.status(502).json({ error: `Supabase error ${sbRes.status}`, detail: errBody.slice(0, 300) });
    }
    const clientsWithSub = await sbRes.json();

    const results = await Promise.all(clientsWithSub.map(async (c) => {
      try {
        const sub  = await stripeGet(`subscriptions/${encodeURIComponent(c.stripe_subscription_id)}`);
        const item = sub.items?.data?.[0];
        const interval      = item?.price?.recurring?.interval || 'month';
        const intervalCount = item?.price?.recurring?.interval_count || 1;

        const invoicesData = await stripeGet(`invoices?subscription=${encodeURIComponent(c.stripe_subscription_id)}&status=paid&limit=100`);
        const paidInvoices = invoicesData?.data || [];
        const paidCount    = paidInvoices.length;
        const totalPaid    = paidInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;
        const paidAtDates  = paidInvoices.map(inv => inv.status_transitions?.paid_at || inv.created).filter(Boolean);
        const firstPaymentAt = paidAtDates.length ? Math.min(...paidAtDates) : (sub.start_date || null);
        const lastPaymentAt  = paidAtDates.length ? Math.max(...paidAtDates) : null;

        // Detalle por factura — permite listar exactamente qué meses se pagaron
        const invoiceDetails = paidInvoices
          .map(inv => ({
            paid_at:      inv.status_transitions?.paid_at || inv.created,
            amount:       (inv.amount_paid || 0) / 100,
            period_start: inv.lines?.data?.[0]?.period?.start || null,
            period_end:   inv.lines?.data?.[0]?.period?.end || null,
          }))
          .sort((a, b) => (a.period_start || a.paid_at) - (b.period_start || b.paid_at));

        return {
          id: c.id,
          slug: c.slug,
          client_name: c.client_name,
          company_name: c.company_name,
          service_name: c.service_name,
          amount_monthly: c.amount_monthly,
          amount_annual: c.amount_annual,
          subscription_id: c.stripe_subscription_id,
          status: sub.status || c.stripe_subscription_status,
          cancel_at_period_end: !!sub.cancel_at_period_end,
          interval,
          interval_count: intervalCount,
          paid_invoices: paidCount,
          months_paid: Math.round(paidCount * monthsPerInterval(interval, intervalCount)),
          total_paid: totalPaid,
          currency: paidInvoices[0]?.currency || 'eur',
          first_payment_at: firstPaymentAt,
          last_payment_at: lastPaymentAt,
          current_period_end: sub.current_period_end || null,
          invoices: invoiceDetails,
        };
      } catch (err) {
        return {
          id: c.id,
          slug: c.slug,
          client_name: c.client_name,
          error: err.message,
        };
      }
    }));

    results.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));
    return res.json(results);
  } catch (err) {
    console.error('[stripe-payments GET]', err);
    return res.status(500).json({ error: 'Error del servidor', detail: err.message });
  }
}
